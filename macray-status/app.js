'use strict';

/* MacRay Status – verschlüsselter Status-Feed als PWA.
 *
 * feed/status.enc:  {"v":1,"iter":N,"salt":b64,"iv":b64,"ct":b64,"mac":b64}
 * Schlüssel:        PBKDF2-SHA256(passwort, salt, iter) -> 64 Bytes
 *                   [0..31] AES-256-CBC, [32..63] HMAC-SHA256
 * Prüfung:          HMAC(iv || ct) == mac, danach AES-CBC (PKCS7) -> UTF-8-JSON
 * Bilder:           feed/img/<hash>.bin = iv(16) || ct || mac(32), gleiche Schlüssel
 */

const FEED_URL = 'feed/status.enc';
const POLL_MS = 30_000;
const STALE_MS = 10 * 60_000;
const LS_KEYS = 'macray.keys.v1';     // { "<iter>:<salt>": "<b64 der 64 Schlüsselbytes>" }
const LS_NOTIFY = 'macray.notify';
const MAX_STORED_KEYS = 3;

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Speicher (immer in try/catch – z. B. privater Modus)                */
/* ------------------------------------------------------------------ */

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* egal */ }
}

/* ------------------------------------------------------------------ */
/* Kryptografie                                                        */
/* ------------------------------------------------------------------ */

class WrongPassword extends Error {}
class NeedPassword extends Error {}

const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (u8) => btoa(String.fromCharCode(...u8));

let password = null;          // nur im Arbeitsspeicher, nie gespeichert
let remember = false;         // abgeleitete Schlüssel in localStorage ablegen?
const keyCache = new Map();   // "<iter>:<salt>" -> Promise<{aes, mac}>

async function importKeys(raw) {
  const aes = await crypto.subtle.importKey('raw', raw.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
  const mac = await crypto.subtle.importKey('raw', raw.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return { aes, mac };
}

async function deriveRaw(pw, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: iter, hash: 'SHA-256' }, base, 512);
  return new Uint8Array(bits);
}

function storeRawKey(id, raw) {
  const stored = lsGet(LS_KEYS, {});
  delete stored[id];
  stored[id] = bytesToB64(raw);
  const ids = Object.keys(stored);
  while (ids.length > MAX_STORED_KEYS) delete stored[ids.shift()];
  lsSet(LS_KEYS, stored);
}

function forgetKey(id) {
  keyCache.delete(id);
  const stored = lsGet(LS_KEYS, {});
  if (id in stored) { delete stored[id]; lsSet(LS_KEYS, stored); }
}

/** Schlüssel für ein bestimmtes Salt/Iterationen holen – aus Cache, localStorage oder neu abgeleitet. */
function getKeys(saltB64, iter) {
  const id = `${iter}:${saltB64}`;
  if (keyCache.has(id)) return { id, keys: keyCache.get(id) };

  const stored = lsGet(LS_KEYS, {})[id];
  let p;
  if (stored) {
    p = importKeys(b64ToBytes(stored));
  } else if (password !== null) {
    p = deriveRaw(password, saltB64, iter).then((raw) => {
      if (remember) storeRawKey(id, raw);
      return importKeys(raw);
    });
  } else {
    throw new NeedPassword();
  }
  p.catch(() => keyCache.delete(id));
  keyCache.set(id, p);
  return { id, keys: p };
}

/** HMAC prüfen, dann entschlüsseln. Liefert Uint8Array oder wirft WrongPassword. */
async function openBox(keys, iv, ct, mac) {
  const signed = new Uint8Array(iv.length + ct.length);
  signed.set(iv, 0);
  signed.set(ct, iv.length);
  const ok = await crypto.subtle.verify('HMAC', keys.mac, mac, signed);
  if (!ok) throw new WrongPassword();
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, keys.aes, ct));
}

let currentKeys = null;  // Schlüssel des zuletzt erfolgreich entschlüsselten Feeds

async function fetchStatus() {
  const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Feed nicht erreichbar (HTTP ${res.status})`);
  const box = await res.json();
  if (box.v !== 1) throw new Error(`Unbekannte Feed-Version: ${box.v}`);

  const { id, keys: keysP } = getKeys(box.salt, box.iter);
  const keys = await keysP;
  try {
    const plain = await openBox(keys, b64ToBytes(box.iv), b64ToBytes(box.ct), b64ToBytes(box.mac));
    currentKeys = keys;
    return JSON.parse(dec.decode(plain));
  } catch (e) {
    if (e instanceof WrongPassword) forgetKey(id);
    throw e;
  }
}

/* ---------- Bilder ---------- */

const imgCache = new Map(); // file -> Promise<blobUrl>

function loadImage(file) {
  if (imgCache.has(file)) return imgCache.get(file);
  const keys = currentKeys;
  const p = (async () => {
    const res = await fetch(`feed/${file}`);   // Name = Hash, ändert sich nie -> darf gecacht werden
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 16 + 16 + 32) throw new Error('Datei zu kurz');
    const iv = buf.subarray(0, 16);
    const ct = buf.subarray(16, buf.length - 32);
    const mac = buf.subarray(buf.length - 32);
    const jpeg = await openBox(await keys, iv, ct, mac);
    return URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
  })();
  p.catch(() => imgCache.delete(file));
  imgCache.set(file, p);
  return p;
}

function dropImages() {
  for (const p of imgCache.values()) p.then((u) => URL.revokeObjectURL(u), () => {});
  imgCache.clear();
}

/* ------------------------------------------------------------------ */
/* Formatierung                                                        */
/* ------------------------------------------------------------------ */

/** ISO-Zeit ohne Zeitzone wird als lokale Zeit interpretiert (wie vom Mac geschrieben). */
function parseTime(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const pad = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a.toDateString() === b.toDateString();

function fmtClock(d, withSeconds = false) {
  if (!d) return '–';
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? ':' + pad(d.getSeconds()) : ''}`;
  return sameDay(d, new Date()) ? t : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${t}`;
}

function fmtDuration(ms) {
  let s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d} T ${h} h`;
  if (h) return `${h} h ${pad(m)} min`;
  return `${m}:${pad(s)} min`;
}

function fmtAgo(ms) {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `vor ${h} h ${pad(m % 60)} min`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

function fmtDb(v) {
  if (typeof v !== 'number' || !isFinite(v)) return '–';
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(2)} dB`;
}
const signClass = (v) => (typeof v === 'number' ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : '');

/** Kleines DOM-Hilfsmittel – setzt Text immer als textContent (kein innerHTML). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Darstellung                                                         */
/* ------------------------------------------------------------------ */

const STATE_LABEL = { running: 'läuft', done: 'fertig', FAILED: 'Fehler', retrying: 'neuer Versuch' };
const STATE_ORDER = { running: 0, retrying: 1, FAILED: 2, done: 3 };
const KIND_ICON = { train: '🧠', record: '🎙️' };

let data = null;
let lastFetchAt = 0;
let lastError = null;

function render() {
  if (!data) return;
  renderAutopilot(data.autopilot);
  renderJobs(data.jobs || []);
  renderPlan(data.plan || []);
  renderNotes(data.notes || []);
  renderImages(data.images || []);
  tick();
}

function renderAutopilot(a) {
  $('autopilotSec').hidden = !a;
  if (!a) return;
  const tile = (label, value, sub, cls = '') =>
    h('div', { class: 'tile' },
      h('div', { class: 'label', text: label }),
      h('div', { class: `value ${cls}`, text: value }),
      sub ? h('div', { class: 'sub', text: sub, title: sub }) : null);
  $('autopilot').replaceChildren(
    tile('Runde', a.round ?? '–'),
    tile('Bester', fmtDb(a.best_score), a.best_name, signClass(a.best_score)),
    tile('k-Bester', fmtDb(a.k_best_score), a.k_best_name, signClass(a.k_best_score)),
  );
}

function jobProgress(j) {
  if (typeof j.progress === 'number') return Math.min(1, Math.max(0, j.progress));
  if (j.steps) return Math.min(1, Math.max(0, (j.step || 0) / j.steps));
  return j.state === 'done' ? 1 : 0;
}

function renderJobs(jobs) {
  const box = $('jobs');
  if (!jobs.length) { box.replaceChildren(h('p', { class: 'muted', text: 'Keine Jobs.' })); return; }
  const sorted = [...jobs].sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9));
  box.replaceChildren(...sorted.map((j) => {
    const p = jobProgress(j);
    const active = j.state === 'running' || j.state === 'retrying';
    const eta = parseTime(j.eta);
    return h('article', { class: `job ${j.state || ''}` },
      h('div', { class: 'job-head' },
        h('span', { text: KIND_ICON[j.kind] || '⚙️', title: j.kind === 'record' ? 'Aufnahme' : 'Training' }),
        h('span', { class: 'job-name', text: j.name || '(ohne Namen)' }),
        h('span', { class: `badge ${j.state || ''}`, text: STATE_LABEL[j.state] || j.state || '?' })),
      h('div', { class: 'bar' }, h('div', { style: `width:${(p * 100).toFixed(1)}%` })),
      h('div', { class: 'job-stats' },
        h('span', { class: 'pct', text: `${Math.floor(p * 100)} %` }),
        j.steps ? h('span', { class: 'muted', text: `Schritt ${j.step ?? 0} / ${j.steps}` }) : null,
        active && eta
          ? h('span', { class: 'eta' }, 'noch ', h('span', { class: 'countdown', 'data-eta': eta.getTime() }), ` · ~${fmtClock(eta)}`)
          : null),
      h('div', { class: 'job-meta' },
        j.started ? h('span', { text: `Start ${fmtClock(parseTime(j.started))}` }) : null,
        j.updated ? h('span', { text: `zuletzt ${fmtClock(parseTime(j.updated))}` }) : null,
        typeof j.val_l1 === 'number' ? h('span', { text: `val L1 ${j.val_l1.toPrecision(4)}` }) : null));
  }));
}

function renderPlan(plan) {
  $('planSec').hidden = !plan.length;
  $('plan').replaceChildren(...plan.map((s) =>
    h('li', { class: s.state || 'todo' },
      h('span', { class: 'dot', text: s.state === 'done' ? '✓' : '' }),
      h('div', { class: 'tl-body' },
        h('span', { class: 'tl-step', text: s.step }),
        h('span', { class: 'tl-time', text: s.eta ? fmtClock(parseTime(s.eta)) : '' })))));
}

let notesExpanded = false;
let seenNotes = null; // Set der bereits gesehenen Meldungen (für Hervorhebung)

function renderNotes(notes) {
  $('notesSec').hidden = !notes.length;
  const prev = seenNotes;
  seenNotes = new Set(notes);
  const list = $('notes');
  list.classList.toggle('collapsed', !notesExpanded);
  list.replaceChildren(...notes.map((n) => {
    const m = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/s.exec(n);
    return h('li', { class: prev && !prev.has(n) ? 'new' : '' },
      m ? h('time', { text: m[1] }) : null,
      h('span', { text: m ? m[2] : n }));
  }));
  list.nextElementSibling?.remove();
  if (notes.length > 15 && !notesExpanded) {
    list.after(h('button', {
      class: 'btn more-btn', text: `Alle ${notes.length} Meldungen anzeigen`,
      onclick: (e) => { notesExpanded = true; e.target.remove(); list.classList.remove('collapsed'); },
    }));
  }
}

let shownImages = '';

function renderImages(images) {
  $('imagesSec').hidden = !images.length;
  const sig = JSON.stringify(images);
  if (sig === shownImages) return;     // nichts geändert -> nicht neu aufbauen (kein Flackern)
  shownImages = sig;
  const keep = new Set(images.map((i) => i.file));
  for (const [file, p] of imgCache) {
    if (!keep.has(file)) { p.then((u) => URL.revokeObjectURL(u), () => {}); imgCache.delete(file); }
  }
  $('gallery').replaceChildren(...images.map((im) => {
    const ph = h('div', { class: 'ph', text: 'entschlüssle …' });
    const time = fmtClock(parseTime(im.time));
    const fig = h('figure', { class: 'thumb' }, ph,
      h('figcaption', {},
        h('span', { text: im.caption || '' }),
        h('time', { text: im.time ? time : '' })));
    loadImage(im.file).then((url) => {
      const img = h('img', { src: url, alt: im.caption || '', loading: 'lazy' });
      ph.replaceWith(img);
      fig.addEventListener('click', () => openLightbox(url, im.caption, time));
    }, () => { ph.textContent = '⚠ nicht lesbar'; });
    return fig;
  }));
}

function openLightbox(url, caption, time) {
  $('lbImg').src = url;
  $('lbImg').alt = caption || '';
  $('lbCaption').textContent = caption || '';
  $('lbTime').textContent = time || '';
  $('lightbox').hidden = false;
  history.pushState({ lightbox: true }, '');
}
function closeLightbox(fromHistory = false) {
  if ($('lightbox').hidden) return;
  $('lightbox').hidden = true;
  $('lbImg').removeAttribute('src');
  if (!fromHistory && history.state?.lightbox) history.back();
}

/** Läuft jede Sekunde: Countdown, „vor x min“, Veraltet-Warnung. */
function tick() {
  const now = Date.now();
  for (const el of document.querySelectorAll('.countdown')) {
    const left = Number(el.dataset.eta) - now;
    el.textContent = left > 0 ? fmtDuration(left) : 'überfällig';
  }

  const upd = data ? parseTime(data.updated) : null;
  const age = upd ? now - upd.getTime() : Infinity;
  const stale = age > STALE_MS;
  const u = $('updated');
  u.textContent = upd ? `Stand ${fmtClock(upd, true)} · ${fmtAgo(age)}` : 'Stand unbekannt';
  u.classList.toggle('stale', stale && !!data);

  const banner = $('staleBanner');
  banner.hidden = !(stale && data);
  if (!banner.hidden) {
    banner.textContent = upd
      ? `⚠ Daten sind ${fmtAgo(age).replace('vor ', '')} alt – läuft das Skript auf dem Mac noch?`
      : '⚠ Feed enthält keinen gültigen Zeitstempel.';
  }

  const err = $('errorBanner');
  err.hidden = !lastError;
  if (lastError) err.textContent = `Abruf fehlgeschlagen: ${lastError} (letzter Erfolg ${lastFetchAt ? fmtAgo(now - lastFetchAt) : 'nie'})`;
}

/* ------------------------------------------------------------------ */
/* Benachrichtigungen                                                  */
/* ------------------------------------------------------------------ */

let notifyOn = lsGet(LS_NOTIFY, false) && 'Notification' in window && Notification.permission === 'granted';

function updateNotifyBtn() {
  const btn = $('notifyBtn');
  btn.textContent = notifyOn ? '🔔' : '🔕';
  btn.title = notifyOn ? 'Benachrichtigungen an' : 'Benachrichtigungen aus';
}

async function toggleNotify() {
  if (!('Notification' in window)) {
    toast('Dieser Browser unterstützt keine Benachrichtigungen. (iPhone: App erst zum Home-Bildschirm hinzufügen.)');
    return;
  }
  if (notifyOn) {
    notifyOn = false;
  } else {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    notifyOn = perm === 'granted';
    if (!notifyOn) toast('Benachrichtigungen wurden nicht erlaubt.');
    else toast('Benachrichtigungen an – solange die App geöffnet ist bzw. im Hintergrund läuft.');
  }
  lsSet(LS_NOTIFY, notifyOn);
  updateNotifyBtn();
}

async function notify(title, body, tag) {
  if (!notifyOn || Notification.permission !== 'granted') return;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* Fallback unten */ }
  try { new Notification(title, opts); } catch { /* z. B. Android ohne SW */ }
}

function diffAndNotify(prev, next) {
  if (!prev) return;
  const before = new Map((prev.jobs || []).map((j) => [j.name, j.state]));
  for (const j of next.jobs || []) {
    const was = before.get(j.name);
    if (was === j.state) continue;
    if (j.state === 'done') notify(`✅ Fertig: ${j.name}`, j.val_l1 != null ? `val L1 ${j.val_l1}` : 'Job abgeschlossen', `job-${j.name}`);
    else if (j.state === 'FAILED') notify(`❌ Fehlgeschlagen: ${j.name}`, 'Job ist fehlgeschlagen', `job-${j.name}`);
  }
  const old = new Set(prev.notes || []);
  const fresh = (next.notes || []).filter((n) => !old.has(n));
  fresh.slice(0, 3).reverse().forEach((n, i) => notify('MacRay', n, `note-${Date.now()}-${i}`));
  if (fresh.length > 3) notify('MacRay', `… und ${fresh.length - 3} weitere Meldungen`, 'note-more');
}

/* ------------------------------------------------------------------ */
/* Ablauf                                                              */
/* ------------------------------------------------------------------ */

let pollTimer = null;
let loading = false;

async function refresh() {
  if (loading) return;
  loading = true;
  $('refreshBtn').classList.add('spin');
  try {
    const next = await fetchStatus();
    diffAndNotify(data, next);
    data = next;
    lastFetchAt = Date.now();
    lastError = null;
    render();
  } catch (e) {
    if (e instanceof NeedPassword) {
      showLogin('Der Schlüssel auf dem Mac hat sich geändert – bitte Passwort erneut eingeben.');
    } else if (e instanceof WrongPassword) {
      showLogin('Das Passwort passt nicht mehr – bitte neu eingeben.');
    } else {
      lastError = e.message || String(e);
      tick();
    }
  } finally {
    loading = false;
    $('refreshBtn').classList.remove('spin');
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(refresh, POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function showLogin(hint) {
  stopPolling();
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginHint').textContent = hint || 'Die Daten sind verschlüsselt. Bitte Passwort eingeben.';
  $('loginError').textContent = '';
  $('pw').value = '';
  setTimeout(() => $('pw').focus(), 50);
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  render();
  startPolling();
}

async function onLogin(ev) {
  ev.preventDefault();
  const btn = $('unlockBtn');
  btn.disabled = true;
  btn.textContent = 'Entschlüssle …';
  $('loginError').textContent = '';
  password = $('pw').value;
  remember = $('remember').checked;
  keyCache.clear();
  try {
    const next = await fetchStatus();
    if (!remember) lsDel(LS_KEYS);
    data = next;
    lastFetchAt = Date.now();
    lastError = null;
    $('pw').value = '';
    showApp();
  } catch (e) {
    password = null;
    $('loginError').textContent = e instanceof WrongPassword ? 'Falsches Passwort' : (e.message || String(e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entsperren';
  }
}

function logout() {
  stopPolling();
  password = null;
  remember = false;
  currentKeys = null;
  keyCache.clear();
  lsDel(LS_KEYS);
  dropImages();
  shownImages = '';
  seenNotes = null;
  data = null;
  $('gallery').replaceChildren();
  $('jobs').replaceChildren();
  showLogin('Abgemeldet.');
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

async function init() {
  $('loginForm').addEventListener('submit', onLogin);
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', refresh);
  $('notifyBtn').addEventListener('click', toggleNotify);
  $('lightbox').addEventListener('click', () => closeLightbox());
  window.addEventListener('popstate', () => closeLightbox(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('app').hidden) refresh();
  });
  updateNotifyBtn();
  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  if (!window.crypto?.subtle) {
    showLogin('Dieser Browser bietet kein Web Crypto (nur über HTTPS verfügbar).');
    return;
  }

  // Gemerkte Schlüssel vorhanden? Dann direkt versuchen.
  if (Object.keys(lsGet(LS_KEYS, {})).length) {
    remember = true;
    $('login').hidden = true;
    $('app').hidden = false;
    await refresh();
    if (!$('app').hidden) startPolling();
  } else {
    showLogin();
  }
}

init();
