/* Oberfläche: baut alle vier Bildschirme, das Detailblatt und die
   Enthüllungs-Animation nach jeder Verschmelzung. */

import {
  ELEMENTS, SPECIALS, UNLOCK_ORDER, CORE_UPGRADES, upgradeCost, TIERS,
  MILESTONES, TRANSCEND_WAVE, starsFor, starDamage, starEssence, AFFIXES,
  MERCHANT, isSpecial, craftCost
} from './data.js';
import {
  ability, canFuse, reforgeCost, describe, composition
} from './fusion.js';
import { glyphURL } from './glyph.js';
import { ability as abilityOf, baseId } from './fusion.js';
import * as G from './state.js';
import { $, $$, fmt, withAlpha, clamp, buzz, TAU, rng } from './util.js';
import { sfx, setEnabled as setSound } from './audio.js';

/* ------------------------------------------------------------------ *
 * Kleinkram
 * ------------------------------------------------------------------ */

export function toast(msg, kind = '') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2100);
  while (host.children.length > 3) host.firstChild.remove();
}

/* Langes Drücken für Details, kurzes Tippen für die Hauptaktion. */
function bindTap(el, onTap, onHold) {
  let timer = null, held = false, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    held = false; sx = e.clientX; sy = e.clientY;
    if (onHold) {
      timer = setTimeout(() => { held = true; buzz(12); onHold(); }, 420);
    }
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel();
  });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointerup', () => {
    cancel();
    if (!held) onTap();
  });
}

function abilityCard(a, opt = {}) {
  const el = document.createElement('button');
  el.className = 'card'
    + (opt.selected ? ' selected' : '')
    + (opt.equipped ? ' equipped' : '')
    + (opt.locked ? ' locked' : '');
  el.style.setProperty('--tint', withAlpha(a.colors.glow, 0.55));

  const img = document.createElement('img');
  img.src = glyphURL(a, 96);
  img.alt = '';
  el.appendChild(img);

  const name = document.createElement('div');
  name.className = 'cname';
  name.textContent = a.name;
  el.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'cmeta';
  meta.innerHTML =
    `<span class="ctier" style="color:${a.tier.color}">${a.tier.roman}</span>` +
    `<span class="cpow">⚡${fmt(a.power)}</span>`;
  el.appendChild(meta);

  /* Ab Legendär bekommt die Karte einen langsam wandernden Glanz. */
  if (['IV', 'V', 'VI', 'VII'].includes(a.tier.roman)) {
    const shine = document.createElement('span');
    shine.className = 'shine';
    el.appendChild(shine);
    el.style.borderColor = withAlpha(a.tier.color, 0.45);
  }
  return el;
}

function lockedCard() {
  const el = document.createElement('div');
  el.className = 'card locked';
  el.innerHTML = '<div style="width:100%;aspect-ratio:1;max-width:62px"></div>' +
                 '<div class="cname">?????</div><div class="cmeta">—</div>' +
                 '<div class="clock">✦</div>';
  return el;
}

/* ------------------------------------------------------------------ *
 * Zustand der Oberfläche
 * ------------------------------------------------------------------ */
const ui = {
  screen: 'battle',
  sel: [null, null],        /* ausgewählte Inventar-uids für die Fusion */
  arena: null,
  lastEssence: 0,
  buyAmount: 1
};

export function setArena(a) { ui.arena = a; }

/* ------------------------------------------------------------------ *
 * Kopfzeile
 * ------------------------------------------------------------------ */
export function renderTop() {
  const e = $('#resEssence'), p = $('#resPower'), w = $('#resWave');
  e.querySelector('b').textContent = fmt(G.S.essence);
  p.querySelector('b').textContent = fmt(G.totalPower());
  w.querySelector('b').textContent = G.S.wave;
  if (G.S.essence > ui.lastEssence + 0.5) {
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }
  ui.lastEssence = G.S.essence;
}

/* ------------------------------------------------------------------ *
 * Kampf-HUD (wird vom Arena-Loop gefüttert)
 * ------------------------------------------------------------------ */
let pipCache = '';
export function renderHud(h) {
  const btn = $('#btnFocus');
  const fill = btn.querySelector('.focus-fill');
  fill.style.transform = `scaleX(${h.focusActive > 0 ? 1 : h.focus})`;
  const ready = h.focus >= 1 && h.focusActive <= 0;
  btn.classList.toggle('ready', ready);
  btn.classList.toggle('active', h.focusActive > 0);
  btn.disabled = !ready && h.focusActive <= 0;
  btn.querySelector('.focus-label').textContent =
    h.focusActive > 0 ? Math.ceil(h.focusActive / 1000) + 's' : 'FOKUS';

  /* Ausrüstungs-Anzeigen nur neu bauen, wenn sich das Deck ändert. */
  const key = h.deck.map(a => (a ? a.id : '-')).join(',');
  const host = $('#deckPips');
  if (key !== pipCache) {
    pipCache = key;
    host.innerHTML = '';
    h.deck.forEach((a) => {
      const pip = document.createElement('div');
      pip.className = 'pip' + (a ? '' : ' empty');
      if (a) {
        const img = document.createElement('img');
        img.src = glyphURL(a, 64);
        pip.appendChild(img);
        const cd = document.createElement('div');
        cd.className = 'cd';
        pip.appendChild(cd);
      }
      host.appendChild(pip);
    });
  }
  h.deck.forEach((a, i) => {
    const pip = host.children[i];
    if (!pip || !a) return;
    const bar = pip.querySelector('.cd');
    if (bar) {
      const k = clamp((h.cooldowns[i] || 0) / a.stats.cd, 0, 1);
      bar.style.height = (k * 100) + '%';
    }
  });

  $('#deadOverlay').classList.toggle('hidden', h.state !== 'dead');
}

/* ------------------------------------------------------------------ *
 * Schmiede
 * ------------------------------------------------------------------ */
export function renderForge() {
  renderMerchant();
  renderFusionStage();
  renderRuneShop();
  renderInventory();
}

/* ------------------------------------------------------------------ *
 * Der Händler
 * ------------------------------------------------------------------ */
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function renderMerchant() {
  const box = $('#merchantBox');
  if (!box) return;

  if (G.S.bestWave < MERCHANT.firstAtWave) {
    box.classList.add('hidden');
    markMerchantTab(false);
    return;
  }
  box.classList.remove('hidden');

  if (!G.merchantHere()) {
    box.className = 'merchant waiting';
    box.innerHTML =
      '<span class="m-ico">🜛</span>' +
      `<span class="m-wait">Der Händler kommt in <b>${mmss(G.merchantSecondsUntil())}</b></span>`;
    markMerchantTab(false);
    return;
  }

  markMerchantTab(true);
  box.className = 'merchant';
  const left = G.merchantSecondsLeft();
  box.innerHTML =
    '<div class="m-head"><span class="m-ico">🜛</span>' +
    '<div><div class="m-title">Der Händler ist da</div>' +
    `<div class="m-sub">Zieht weiter in <b>${mmss(left)}</b> · alles nur einmal zu haben</div></div></div>` +
    '<div class="m-offers" id="mOffers"></div>';

  const host = $('#mOffers');
  for (const o of G.merchantStock()) {
    const el = SPECIALS[o.code];
    const a = abilityOf(baseId(o.code));
    const card = document.createElement('button');
    const affordable = G.S.essence >= o.price && o.left > 0;
    card.className = 'offer' + (o.left <= 0 ? ' sold' : '') + (affordable ? '' : ' cant');
    card.innerHTML =
      `<img src="${glyphURL(a, 96)}" alt="">` +
      `<span class="o-name">${el.name}</span>` +
      `<span class="o-eff">${el.effectName}</span>` +
      `<span class="o-price">${o.left > 0 ? fmt(o.price) + ' ✦' : 'ausverkauft'}</span>` +
      `<span class="o-stock">${o.left > 0 ? o.left + '× übrig' : ''}</span>`;
    bindTap(card,
      () => {
        const r = G.buySpecial(o.index);
        if (r.ok) {
          buzz([12, 40, 16]);
          r.isNew ? sfx.discover() : sfx.buy();
          toast(`${r.name}-Rune erstanden${r.isNew ? ' · neu im Kodex' : ''}`, 'good');
          maybeAutoMerge();
        } else { sfx.error(); toast(r.msg, 'bad'); }
        renderMerchant();
      },
      () => openSheet(baseId(o.code), { from: 'merchant' })
    );
    host.appendChild(card);
  }
}

function markMerchantTab(on) {
  const tab = document.querySelector('.tab[data-screen="forge"]');
  if (tab) tab.classList.toggle('has-news', on);
}

function selectedIds() {
  return ui.sel.map(u => {
    const e = u ? G.invEntry(u) : null;
    return e ? e.id : null;
  });
}

function renderFusionStage() {
  const ids = selectedIds();
  [0, 1].forEach(i => {
    const slot = $(i === 0 ? '#fslotA' : '#fslotB');
    slot.innerHTML = '';
    const id = ids[i];
    if (!id) {
      slot.className = 'fslot';
      slot.style.borderColor = '';
      slot.innerHTML = '<span class="hint">Antippen</span>';
      return;
    }
    const a = ability(id);
    slot.className = 'fslot filled';
    slot.style.borderColor = withAlpha(a.colors.glow, 0.8);
    const img = document.createElement('img');
    img.src = glyphURL(a, 128);
    slot.appendChild(img);
    const nm = document.createElement('div');
    nm.className = 'fname';
    nm.textContent = a.name;
    slot.appendChild(nm);
  });

  const pv = $('#fusionPreview');
  const btn = $('#btnFuse');
  pv.innerHTML = '';
  if (!ids[0] || !ids[1]) {
    pv.innerHTML = '<span>Wähle unten zwei Fähigkeiten aus deinem Vorrat.</span>';
    btn.disabled = true;
    btn.textContent = 'Verschmelzen';
    return;
  }
  const check = canFuse(ids[0], ids[1]);
  if (!check.ok) {
    pv.innerHTML = `<span>${check.reason}</span>`;
    btn.disabled = true;
    return;
  }
  const res = ability(check.id);
  const best = Math.max(ability(ids[0]).power, ability(ids[1]).power);
  const gain = Math.round((res.power / Math.max(1, best) - 1) * 100);
  const isNew = !G.S.codex[res.id];
  pv.innerHTML =
    `<span class="pv-name" style="color:${res.tier.color}">${res.name}</span>` +
    `<span>${res.tier.name} · ⚡${fmt(res.power)} ` +
    `<b style="color:${gain >= 0 ? 'var(--good)' : 'var(--danger)'}">${gain >= 0 ? '+' : ''}${gain}%</b></span>` +
    (isNew ? '<span class="pv-new">NEU</span>' : '');
  btn.disabled = false;
  btn.textContent = 'Verschmelzen';
}

function renderRuneShop() {
  const host = $('#runeShop');
  host.innerHTML = '';
  const next = G.nextElementToUnlock();
  const n = ui.buyAmount;

  for (const code of UNLOCK_ORDER) {
    const el = ELEMENTS[code];
    const owned = G.S.unlocked.includes(code);
    /* Kosten für n Stück, jede einzelne teurer als die vorige. */
    let cost = 0;
    if (owned) {
      const made = G.S.crafted[code] || 0;
      for (let k = 0; k < n; k++) cost += craftCost(code, made + k);
    } else cost = el.unlock;
    const gated = !owned && G.S.bestWave < el.minWave;
    const affordable = G.S.essence >= cost;
    const btn = document.createElement('button');
    btn.className = 'rune' + (owned ? '' : ' locked') +
                    (affordable && !gated && (owned || code === next) ? '' : ' cant');
    btn.innerHTML =
      `<span class="dot" style="background:linear-gradient(135deg,${el.colors[0]},${el.colors[1]})"></span>` +
      `<span><span class="rn">${el.name}</span><br>` +
      `<span class="rc">${owned ? fmt(cost) + ' ✦' + (n > 1 ? ' ×' + n : '')
                                : code !== next ? 'gesperrt'
                                : gated ? 'ab Welle ' + el.minWave
                                : 'Frei ab ' + fmt(cost) + ' ✦'}</span></span>`;
    btn.addEventListener('click', () => {
      if (owned) {
        let made = 0;
        for (let i = 0; i < n; i++) {
          if (!G.craftRune(code).ok) break;
          made++;
        }
        if (made) {
          buzz(8); sfx.buy();
          toast(`${made}× ${el.name}-Rune geschmiedet`, 'good');
          maybeAutoMerge();
        } else {
          sfx.error();
          toast(G.S.inv.length >= G.INV_LIMIT ? 'Vorrat voll — verwerte etwas.' : 'Zu wenig Essenz.', 'bad');
        }
      } else if (code === next && !gated) {
        const r = G.unlockElement(code);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) { buzz([10, 40, 20]); sfx.discover(); }
        else sfx.error();
      } else if (gated) {
        sfx.error();
        toast(`${el.name} findest du erst ab Welle ${el.minWave}.`, 'bad');
      } else {
        sfx.error();
        toast('Schalte erst ' + ELEMENTS[next].name + ' frei.', 'bad');
      }
    });
    host.appendChild(btn);
  }
  $('#runeHint').textContent = 'Rohmaterial jeder Fusion';

  $$('#buyAmount button').forEach(b => {
    b.classList.toggle('is-on', Number(b.dataset.n) === ui.buyAmount);
  });

  const tgl = $('#autoMergeToggle');
  if (tgl) tgl.classList.toggle('is-on', !!G.S.opt.autoMerge);
}

/* Wenn Auto-Verschmelzen an ist, gleich nach jedem Zuwachs aufräumen. */
export function maybeAutoMerge() {
  if (!G.S.opt.autoMerge) return null;
  const r = G.autoMergeAll();
  if (r.merged) {
    sfx.fuse();
    toast(`${r.merged}× verschmolzen${r.discovered ? ` · ${r.discovered} neu entdeckt` : ''}`, 'good');
  }
  return r;
}

function renderInventory() {
  const host = $('#inventoryGrid');
  host.innerHTML = '';
  $('#invCount').textContent = `${G.S.inv.length} / ${G.INV_LIMIT}`;

  if (!G.S.inv.length) {
    host.innerHTML = '<div class="empty-note">Dein Vorrat ist leer.<br>Schmiede oben eine Basisrune.</div>';
    return;
  }
  const sorted = G.S.inv.slice().sort((x, y) => ability(y.id).power - ability(x.id).power);
  for (const entry of sorted) {
    const a = ability(entry.id);
    const card = abilityCard(a, {
      selected: ui.sel.includes(entry.u),
      equipped: G.isEquipped(entry.u)
    });
    bindTap(card,
      () => toggleSelect(entry.u),
      () => openSheet(entry.id, { entry, from: 'forge' })
    );
    host.appendChild(card);
  }
}

function toggleSelect(u) {
  const i = ui.sel.indexOf(u);
  if (i >= 0) ui.sel[i] = null;
  else if (!ui.sel[0]) ui.sel[0] = u;
  else if (!ui.sel[1]) ui.sel[1] = u;
  else ui.sel = [ui.sel[1], u];
  buzz(6);
  renderForge();
}

export function clearSelection() { ui.sel = [null, null]; }
export function getSelection() { return ui.sel.slice(); }

/* Einmalige Verdrahtung der festen Elemente. */
export function initUI() {
  $('#fslotA').addEventListener('click', () => { ui.sel[0] = null; renderForge(); });
  $('#fslotB').addEventListener('click', () => { ui.sel[1] = null; renderForge(); });
  $('.sheet-backdrop').addEventListener('click', closeSheet);

  $$('#buyAmount button').forEach(b => b.addEventListener('click', () => {
    ui.buyAmount = Number(b.dataset.n) || 1;
    sfx.ui();
    renderForge();
  }));

  $('#autoMergeToggle').addEventListener('click', () => {
    G.S.opt.autoMerge = !G.S.opt.autoMerge;
    G.persist();
    sfx.ui();
    if (G.S.opt.autoMerge) maybeAutoMerge();
    renderForge();
    toast(G.S.opt.autoMerge ? 'Auto-Verschmelzen an' : 'Auto-Verschmelzen aus');
  });

  $('#btnMergeNow').addEventListener('click', () => {
    const r = G.autoMergeAll();
    if (r.merged) {
      sfx.fuse(); buzz(12);
      toast(`${r.merged}× verschmolzen${r.discovered ? ` · ${r.discovered} neu` : ''}`, 'good');
    } else {
      sfx.error();
      toast('Keine zwei gleichen Fähigkeiten im Vorrat.', 'bad');
    }
  });

  $('#btnEquipBest').addEventListener('click', () => {
    const r = G.equipBest();
    sfx.buy();
    toast(r.changed ? 'Stärkste Fähigkeiten ausgerüstet.' : 'Du kämpfst schon mit dem Besten.',
          r.changed ? 'good' : '');
  });

  $('#soundBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    G.S.opt.sound = !G.S.opt.sound;
    G.persist();
    setSound(G.S.opt.sound);
    renderSoundBtn();
    if (G.S.opt.sound) sfx.ui();
  });
  renderSoundBtn();
}

/* ------------------------------------------------------------------ *
 * Willkommen zurück — was in der Abwesenheit passiert ist
 * ------------------------------------------------------------------ */
export function showWelcomeBack(res, minutes) {
  const body = $('#sheetBody');
  const zeit = minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`
    : `${Math.round(minutes)} min`;
  body.innerHTML =
    '<div class="sheet-grip"></div>' +
    '<div class="sheet-title" style="margin-bottom:6px">Willkommen zurück</div>' +
    `<div style="color:var(--txt-dim);font-size:13px;margin-bottom:14px">` +
    `Deine Fähigkeiten haben ${zeit} ohne dich weitergekämpft.</div>` +
    '<div class="statgrid">' +
      `<div class="sg"><div class="k">Essenz</div><div class="v" style="color:var(--accent-2)">+${fmt(res.essence)}</div></div>` +
      `<div class="sg"><div class="k">Wellen</div><div class="v">+${res.waves}</div></div>` +
      `<div class="sg"><div class="k">Gegner</div><div class="v">${fmt(Math.round(res.kills))}</div></div>` +
      `<div class="sg"><div class="k">Jetzt bei</div><div class="v">Welle ${res.wave}</div></div>` +
    '</div>' +
    (res.stalled
      ? '<p style="font-size:12px;color:var(--txt-dim);margin-top:12px">Irgendwann ging es nicht mehr weiter — dort wartet eine Welle, für die du erst aufrüsten musst.</p>'
      : '') +
    '<div class="sheet-actions"><button class="btn primary big" id="wbOk">Weiter</button></div>';
  $('#sheet').classList.remove('hidden');
  $('#wbOk').addEventListener('click', closeSheet);
}

/* ------------------------------------------------------------------ *
 * Kern
 * ------------------------------------------------------------------ */
export function renderCore() {
  renderDeck();
  renderEquipGrid();
  renderUpgrades();
  renderMilestones();
  renderTranscend();
  renderStats();
  renderSettings();
}

function renderDeck() {
  const host = $('#deckRow');
  host.innerHTML = '';
  const open = G.slots();
  $('#slotHint').textContent = `${open} von ${G.MAX_SLOTS} Plätzen`;
  const entries = G.deckEntries();

  for (let i = 0; i < G.MAX_SLOTS; i++) {
    const el = document.createElement('button');
    if (i >= open) {
      const need = G.SLOT_WAVES[i - 2];
      el.className = 'deck-slot locked';
      el.innerHTML = `<div class="plus">🔒</div><div class="lockinfo">ab Welle ${need}</div>`;
      el.addEventListener('click', () => toast(`Frei ab Welle ${need}.`));
      host.appendChild(el);
      continue;
    }
    const entry = entries[i];
    if (!entry) {
      el.className = 'deck-slot';
      el.innerHTML = '<div class="plus">+</div><div class="lockinfo">frei</div>';
      el.addEventListener('click', () => toast('Wähle unten eine Fähigkeit.'));
    } else {
      const a = ability(entry.id);
      el.className = 'deck-slot filled';
      el.style.borderColor = withAlpha(a.colors.glow, 0.75);
      const img = document.createElement('img');
      img.src = glyphURL(a, 96);
      el.appendChild(img);
      const nm = document.createElement('div');
      nm.className = 'dn';
      nm.textContent = a.name;
      el.appendChild(nm);
      const pw = document.createElement('div');
      pw.className = 'dp';
      pw.textContent = '⚡' + fmt(a.power);
      el.appendChild(pw);
      bindTap(el,
        () => { G.unequip(i); toast('Abgelegt.'); },
        () => openSheet(entry.id, { entry, from: 'core' })
      );
    }
    host.appendChild(el);
  }
}

function renderEquipGrid() {
  const host = $('#equipGrid');
  host.innerHTML = '';
  if (!G.S.inv.length) {
    host.innerHTML = '<div class="empty-note">Noch nichts im Vorrat.</div>';
    return;
  }
  const sorted = G.S.inv.slice().sort((x, y) => ability(y.id).power - ability(x.id).power);
  for (const entry of sorted) {
    const a = ability(entry.id);
    const card = abilityCard(a, { equipped: G.isEquipped(entry.u) });
    bindTap(card, () => openSheet(entry.id, { entry, from: 'core' }));
    host.appendChild(card);
  }
}

function renderUpgrades() {
  const host = $('#upgradeList');
  host.innerHTML = '';
  for (const key of Object.keys(CORE_UPGRADES)) {
    const u = CORE_UPGRADES[key];
    const lv = G.S.core[key] || 0;
    const maxed = lv >= u.max;
    const cost = upgradeCost(key, lv);
    const row = document.createElement('div');
    row.className = 'upg';
    row.innerHTML =
      `<div class="uico">${u.icon}</div>` +
      `<div class="ubody"><div class="un">${u.name} <span class="ulv">Stufe ${lv}</span></div>` +
      `<div class="ud">${u.desc}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn sm' + (maxed || G.S.essence < cost ? '' : ' primary');
    btn.textContent = maxed ? 'MAX' : `${fmt(cost)} ✦`;
    btn.disabled = maxed;
    btn.addEventListener('click', () => {
      const r = G.buyUpgrade(key);
      toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) buzz(10);
    });
    row.appendChild(btn);
    host.appendChild(row);
  }
}

function renderStats() {
  const host = $('#statList');
  const s = G.S.stats;
  const cs = G.coreStats();
  const rows = [
    [fmt(G.totalPower()), 'Gesamtmacht'],
    [G.S.bestWave, 'Beste Welle'],
    [G.codexCount(), 'Im Kodex'],
    [s.deepest || 1, 'Tiefste Fusion'],
    [fmt(s.kills), 'Besiegte Gegner'],
    [fmt(s.fusions), 'Verschmelzungen'],
    [fmt(Math.round(cs.maxHp)), 'Kern-Leben'],
    [fmt(Math.round(s.essenceTotal)), 'Essenz gesamt']
  ];
  if (G.S.stars > 0) {
    rows.unshift([
      '★ ' + G.S.stars,
      `+${Math.round((starDamage(G.S.stars) - 1) * 100)} % Schaden`
    ]);
  }
  host.innerHTML = rows.map(([v, l]) =>
    `<div class="stat"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join('');
}

/* ------------------------------------------------------------------ *
 * Meilensteine
 * ------------------------------------------------------------------ */
function renderMilestones() {
  const host = $('#mileList');
  if (!host) return;
  host.innerHTML = '';
  const prog = G.milestoneProgress();
  $('#mileCount').textContent = `${prog.done} / ${prog.total}`;

  /* Erledigte oben ausblenden, aber die nächsten drei offenen zeigen —
     eine Liste aus 14 Haken motiviert niemanden. */
  const open = MILESTONES.filter(m => !G.S.mile[m.id]).slice(0, 3);
  const doneRecent = MILESTONES.filter(m => G.S.mile[m.id]).slice(-2);

  for (const m of [...open, ...doneRecent]) {
    const ok = !!G.S.mile[m.id];
    const row = document.createElement('div');
    row.className = 'mile' + (ok ? ' done' : '');
    row.innerHTML =
      `<span class="mk">${ok ? '✓' : '○'}</span>` +
      `<span class="mb"><span class="mn">${m.name}</span>` +
      `<span class="md">${m.desc}</span></span>` +
      `<span class="mr">${ok ? 'erledigt' : '+' + fmt(m.reward) + ' ✦'}</span>`;
    host.appendChild(row);
  }
}

/* ------------------------------------------------------------------ *
 * Transzendenz
 * ------------------------------------------------------------------ */
function renderTranscend() {
  const box = $('#transcendBox');
  if (!box) return;
  const can = G.canTranscend();
  const gain = G.transcendGain();
  const stars = G.S.stars;

  box.innerHTML =
    `<div class="tr-head"><span class="tr-star">★</span>` +
    `<div><div class="tr-n">${stars} Stern${stars === 1 ? '' : 'e'}</div>` +
    `<div class="tr-s">+${Math.round((starDamage(stars) - 1) * 100)} % Schaden · ` +
    `+${Math.round((starEssence(stars) - 1) * 100)} % Essenz</div></div></div>` +
    `<p class="tr-text">Fängt den Lauf von vorn an: Wellen, Essenz, Vorrat und ` +
    `Kern-Upgrades werden zurückgesetzt. <b>Kodex und freigeschaltete Elemente ` +
    `bleiben</b> — der nächste Anlauf geht deshalb viel schneller.</p>`;

  const btn = document.createElement('button');
  btn.className = 'btn big ' + (can && gain > 0 ? 'primary' : '');
  btn.disabled = !can || gain <= 0;
  btn.textContent = !can
    ? `Ab Welle ${TRANSCEND_WAVE} möglich`
    : gain > 0 ? `Transzendieren · +${gain} ★` : 'Komm weiter als zuletzt';
  btn.addEventListener('click', () => {
    if (!confirm(`Transzendieren? Du bekommst ${gain} Stern${gain === 1 ? '' : 'e'} ` +
                 `und fängst bei Welle 1 wieder an. Kodex und Elemente bleiben.`)) return;
    const r = G.transcend();
    if (r.ok) {
      sfx.discover();
      buzz([20, 60, 20, 60, 40]);
      toast(`Transzendiert — ${r.stars} ★ insgesamt`, 'good');
    } else toast(r.msg, 'bad');
  });
  box.appendChild(btn);
}

/* ------------------------------------------------------------------ *
 * Einstellungen
 * ------------------------------------------------------------------ */
function renderSettings() {
  const host = $('#settingsList');
  if (!host) return;
  host.innerHTML = '';
  const rows = [
    { key: 'autoMerge', icon: '⇄', name: 'Auto-Verschmelzen',
      desc: 'Gleiche Fähigkeiten im Vorrat legen sich von selbst zusammen. Ausgerüstete bleiben unangetastet.' },
    { key: 'sound', icon: '🔊', name: 'Ton',
      desc: 'Kurze Klänge für Treffer, Fusionen und Bosse.' }
  ];
  for (const r of rows) {
    const on = !!G.S.opt[r.key];
    const row = document.createElement('div');
    row.className = 'upg';
    row.innerHTML =
      `<div class="uico">${r.icon}</div>` +
      `<div class="ubody"><div class="un">${r.name}</div><div class="ud">${r.desc}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'toggle' + (on ? ' is-on' : '');
    btn.innerHTML = '<span class="knob"></span>';
    btn.addEventListener('click', () => {
      G.S.opt[r.key] = !G.S.opt[r.key];
      G.persist();
      if (r.key === 'sound') { setSound(G.S.opt[r.key]); if (G.S.opt[r.key]) sfx.ui(); }
      if (r.key === 'autoMerge' && G.S.opt[r.key]) maybeAutoMerge();
      renderSettings();
      renderSoundBtn();
      if (currentScreen() === 'forge') renderForge();
    });
    row.appendChild(btn);
    host.appendChild(row);
  }
}

export function renderSoundBtn() {
  const b = $('#soundBtn');
  if (b) {
    b.textContent = G.S.opt.sound ? '🔊' : '🔇';
    b.classList.toggle('off', !G.S.opt.sound);
  }
}

/* ------------------------------------------------------------------ *
 * Kodex
 * ------------------------------------------------------------------ */
export function renderCodex() {
  const host = $('#codexGrid');
  host.innerHTML = '';
  const ids = Object.keys(G.S.codex);
  $('#codexCount').textContent = ids.length;

  const counts = {};
  for (const id of ids) {
    const t = ability(id).tier.roman;
    counts[t] = (counts[t] || 0) + 1;
  }
  $('#codexLegend').innerHTML = TIERS
    .filter(t => counts[t.roman])
    .map(t => `<span class="leg" style="background:${withAlpha(t.color, 0.18)};color:${t.color}">${t.roman} · ${counts[t.roman]}</span>`)
    .join('');

  if (!ids.length) {
    host.innerHTML = '<div class="empty-note">Noch nichts entdeckt.</div>';
    return;
  }
  const sorted = ids.slice().sort((x, y) => ability(y).power - ability(x).power);
  for (const id of sorted) {
    const a = ability(id);
    const card = abilityCard(a, {});
    bindTap(card, () => openSheet(id, { from: 'codex' }));
    host.appendChild(card);
  }
  /* Andeutung, dass da noch mehr geht. */
  const ghost = document.createElement('div');
  ghost.className = 'empty-note';
  ghost.style.gridColumn = '1 / -1';
  ghost.textContent = 'Jede Kombination, die noch niemand geschmiedet hat, wartet hier auf ihren Eintrag.';
  host.appendChild(ghost);
}

/* ------------------------------------------------------------------ *
 * Detailblatt
 * ------------------------------------------------------------------ */
export function openSheet(id, ctx = {}) {
  const a = ability(id);
  const body = $('#sheetBody');
  const st = a.stats;

  const stats = [
    ['Schaden', fmt(st.dmg)],
    ['Takt', (st.cd / 1000).toFixed(2) + ' s'],
    ['Geschosse', st.count],
    ['Krit', Math.round(st.crit * 100) + ' % ×' + st.critMult.toFixed(1)],
    ['Radius', Math.round(st.aoe)],
    ['Macht', '⚡' + fmt(a.power)]
  ];

  body.innerHTML =
    '<div class="sheet-grip"></div>' +
    '<button class="sheet-close" aria-label="Schließen">✕</button>' +
    '<div class="sheet-top">' +
      `<img src="${glyphURL(a, 168)}" alt="">` +
      '<div>' +
        `<div class="sheet-tier" style="color:${a.tier.color}">${a.tier.name} · Stufe ${a.tier.roman} · ${a.level} Runen</div>` +
        `<div class="sheet-title">${a.name}</div>` +
        `<div class="sheet-comp">${composition(a)}</div>` +
        `<div class="sheet-power">${describe(a)}</div>` +
      '</div>' +
    '</div>' +
    '<div class="statgrid">' +
      stats.map(([k, v]) => `<div class="sg"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('') +
    '</div>' +
    '<div class="efflist">' +
      a.effects.map(e => {
        const el = ELEMENTS[e.code];
        return `<div class="eff"><span class="ed" style="background:linear-gradient(135deg,${el.colors[0]},${el.colors[1]})"></span>` +
               `<div><b>${e.name}</b> <span>· ${Math.round(e.share * 100)} % ${el.name}</span><br><span>${e.desc}</span></div></div>`;
      }).join('') +
    '</div>' +
    '<div class="sheet-actions" id="sheetActions"></div>';

  const acts = $('#sheetActions');
  const add = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    acts.appendChild(b);
  };

  if (ctx.entry) {
    const u = ctx.entry.u;
    if (G.isEquipped(u)) {
      add('Ablegen', 'ghost', () => {
        const i = G.S.deck.indexOf(u);
        if (i >= 0) G.unequip(i);
        closeSheet();
      });
    } else {
      add('Ausrüsten', 'primary', () => {
        const r = G.equip(u, null);
        toast(r.ok ? 'Ausgerüstet.' : r.msg, r.ok ? 'good' : 'bad');
        closeSheet();
      });
    }
    add('In die Fusion', '', () => {
      if (!ui.sel.includes(u)) toggleSelect(u);
      closeSheet();
      switchTo('forge');
    });
    add(`Verwerten +${fmt(Math.round(reforgeCost(id) * 0.55))} ✦`, 'danger ghost', () => {
      const r = G.dissolve(u);
      if (r.ok) toast(`Zu ${fmt(r.gain)} ✦ aufgelöst.`, 'good');
      closeSheet();
    });
  } else {
    const cost = reforgeCost(id);
    add(`Nachschmieden ${fmt(cost)} ✦`, 'primary', () => {
      const r = G.reforge(id);
      toast(r.ok ? `${a.name} liegt im Vorrat.` : r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { buzz(10); closeSheet(); }
    });
    add('Schließen', 'ghost', closeSheet);
  }

  body.querySelector('.sheet-close').addEventListener('click', closeSheet);
  $('#sheet').classList.remove('hidden');
}

export function closeSheet() { $('#sheet').classList.add('hidden'); }

/* ------------------------------------------------------------------ *
 * Enthüllung
 * ------------------------------------------------------------------ */
export function showReveal(a, isNew, parents) {
  $('#revealGlyph').src = glyphURL(a, 336);
  $('#revealName').textContent = a.name;
  $('#revealName').style.color = a.tier.color;
  $('#revealTier').textContent = `${a.tier.name} · ${a.level} Runen`;
  $('#revealTier').style.color = a.tier.color;
  $('#revealComp').textContent = composition(a);
  const badge = $('#revealBadge');
  badge.textContent = isNew ? 'NEU ENTDECKT' : 'ERNEUT GESCHMIEDET';
  badge.classList.toggle('known', !isNew);

  const best = Math.max(...parents.map(p => ability(p).power));
  const gain = Math.round((a.power / Math.max(1, best) - 1) * 100);
  $('#revealStats').innerHTML =
    `<span class="up">⚡${fmt(a.power)} Macht</span>` +
    `<span class="${gain >= 0 ? 'up' : ''}">${gain >= 0 ? '+' : ''}${gain}% zur besten Zutat</span>` +
    `<span>${fmt(a.stats.dmg)} Schaden</span>` +
    `<span>${(a.stats.cd / 1000).toFixed(2)}s Takt</span>` +
    (a.stats.count > 1 ? `<span>${a.stats.count}× Geschoss</span>` : '') +
    `<span>${Math.round(a.stats.crit * 100)}% Krit</span>`;

  $('#reveal').classList.remove('hidden');
  buzz(isNew ? [14, 50, 26] : 12);
  revealFx(a);
}

function revealFx(a) {
  const cv = $('#revealFx');
  const rect = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = rect.width * dpr; cv.height = rect.height * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const cx = W / 2, cy = H * 0.40;

  const r = rng(a.seed);
  const parts = [];
  const n = 60 + a.level * 4;
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU, sp = 90 + r() * 420;
    parts.push({
      x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: 700 + r() * 900, max: 700 + r() * 900,
      col: r() < 0.5 ? a.colors.a : a.colors.glow, r: 1 + r() * 3
    });
  }
  let ring = 0, last = performance.now(), alive = true;
  const stop = () => { alive = false; };
  cv._stop && cv._stop();
  cv._stop = stop;

  const frame = (now) => {
    if (!alive || $('#reveal').classList.contains('hidden')) { g.clearRect(0, 0, W, H); return; }
    const dt = Math.max(0, Math.min(60, now - last)); last = now;
    g.clearRect(0, 0, W, H);
    ring += dt;
    const rr = Math.max(0, ring * 0.55);
    if (rr < Math.max(W, H)) {
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU);
      g.strokeStyle = withAlpha(a.colors.glow, Math.max(0, 0.7 - rr / Math.max(W, H)));
      g.lineWidth = 4; g.stroke();
    }
    let any = false;
    for (const p of parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      any = true;
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.vx *= 0.98; p.vy = p.vy * 0.98 + 40 * dt / 1000;
      g.globalAlpha = p.life / p.max;
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    if (any || rr < Math.max(W, H)) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function closeReveal() { $('#reveal').classList.add('hidden'); }

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */
export function switchTo(name) {
  ui.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.screen === name));
  if (name === 'forge') renderForge();
  if (name === 'core') renderCore();
  if (name === 'codex') renderCodex();
  if (name === 'battle' && ui.arena) {
    ui.arena.resize();
    ui.arena.start();
  } else if (ui.arena) {
    ui.arena.stop();
  }
}

export const currentScreen = () => ui.screen;

export function refreshCurrent() {
  renderTop();
  if (ui.screen === 'forge') renderForge();
  if (ui.screen === 'core') renderCore();
  if (ui.screen === 'codex') renderCodex();
}

/* ------------------------------------------------------------------ *
 * Erstes Mal: kurze Einführung
 * ------------------------------------------------------------------ */
export function showIntro(onClose) {
  const body = $('#sheetBody');
  body.innerHTML =
    '<div class="sheet-grip"></div>' +
    '<div class="sheet-title" style="margin-bottom:8px">Willkommen in der Aetherforge</div>' +
    '<div style="font-size:14px;line-height:1.55;color:var(--txt-dim);display:flex;flex-direction:column;gap:10px">' +
      '<div><b style="color:var(--txt)">1 · Kämpfen.</b> Deine ausgerüsteten Fähigkeiten feuern von allein. Jeder Sieg bringt Essenz ✦ — auch dann, wenn du gerade woanders bist oder das Spiel geschlossen hast.</div>' +
      '<div><b style="color:var(--txt)">2 · Schmieden.</b> Kauf Basisrunen und verschmilz je zwei Fähigkeiten zu einer neuen. Elemente vermischen sich — Name, Aussehen und Werte entstehen aus deiner Mischung.</div>' +
      '<div><b style="color:var(--txt)">3 · Stärker werden.</b> Je mehr Runen in einer Fähigkeit stecken, desto höher ihre Stufe — und desto prächtiger ihr Siegel. Mehrere <i>verschiedene</i> Elemente geben zusätzlich Bonus.</div>' +
      '<div><b style="color:var(--txt)">4 · Der Händler.</b> Alle paar Minuten kommt einer vorbei und hat Fremdrunen dabei, die es nirgends zu kaufen gibt. Er bleibt nicht lange.</div>' +
      '<div>Jede weitere Rune desselben Elements kostet mehr — reine Menge bringt dich nicht durch. Neue Elemente findest du erst in späteren Wellen.</div>' +
      '<div>Alles, was du je entdeckst, bleibt für immer im Kodex — und lässt sich dort jederzeit nachschmieden.</div>' +
    '</div>' +
    '<div class="sheet-actions"><button class="btn primary big" id="introOk">Los geht\'s</button></div>';
  $('#sheet').classList.remove('hidden');
  $('#introOk').addEventListener('click', () => { closeSheet(); onClose && onClose(); });
}
