/* Spielstand: alles, was gespeichert wird, und alle Aktionen, die ihn ändern.
   Die Oberfläche liest hier nur — geschrieben wird ausschließlich über die
   Funktionen weiter unten, damit Speichern und Neuzeichnen nie vergessen wird. */

import {
  ELEMENTS, UNLOCK_ORDER, CORE_UPGRADES, upgradeCost, coreHp,
  MILESTONES, TRANSCEND_WAVE, starsFor, starDamage, starEssence
} from './data.js';
import { ability, baseId, fusionId, canFuse, reforgeCost, levelOfId } from './fusion.js';
import { saveState, loadState, clearState, uid, clamp } from './util.js';

export const SLOT_WAVES = [4, 9, 15, 22, 30];
export const MAX_SLOTS = 2 + SLOT_WAVES.length;
export const INV_LIMIT = 60;

function freshState() {
  const start = [
    { u: uid(), id: baseId('FE') },
    { u: uid(), id: baseId('WA') }
  ];
  return {
    v: 1,
    essence: 0,
    wave: 1,
    bestWave: 1,
    unlocked: ['FE', 'WA'],
    inv: start,
    deck: [start[0].u, start[1].u],
    codex: { [baseId('FE')]: { n: 1, w: 1 }, [baseId('WA')]: { n: 1, w: 1 } },
    core: { hp: 0, regen: 0, focus: 0, greed: 0 },
    stats: { kills: 0, fusions: 0, essenceTotal: 0, deepest: 1, waves: 0 },
    seen: { intro: false },
    opt: { autoMerge: false, sound: true },
    stars: 0,
    prestiges: 0,
    mile: {},
    lastTick: Date.now()
  };
}

export let S = freshState();

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what) { for (const fn of listeners) fn(what); }

let saveTimer = 0;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(S), 220);
}
function touch(what) { persist(); emit(what); }

export function init() {
  const raw = loadState();
  if (raw && raw.v === 1 && Array.isArray(raw.inv)) {
    S = Object.assign(freshState(), raw);
    S.core = Object.assign({ hp: 0, regen: 0, focus: 0, greed: 0 }, raw.core || {});
    S.stats = Object.assign({ kills: 0, fusions: 0, essenceTotal: 0, deepest: 1 }, raw.stats || {});
    S.seen = Object.assign({ intro: false }, raw.seen || {});
    S.opt = Object.assign({ autoMerge: false, sound: true }, raw.opt || {});
    S.mile = Object.assign({}, raw.mile || {});
    S.stars = raw.stars || 0;
    S.prestiges = raw.prestiges || 0;
    S.lastTick = raw.lastTick || Date.now();
    /* Verwaiste Ausrüstungsplätze aufräumen. */
    S.deck = (S.deck || []).map(u => (S.inv.some(e => e.u === u) ? u : null));
  }
  ensureNotStuck();
  return S;
}

export function hardReset() {
  clearState();
  S = freshState();
  touch('all');
}

/* ---------------- Abgeleitete Werte ---------------- */

export const slots = () => 2 + SLOT_WAVES.filter(w => w <= S.bestWave).length;

export function deckEntries() {
  const out = [];
  for (let i = 0; i < slots(); i++) {
    const u = S.deck[i];
    const e = u ? S.inv.find(x => x.u === u) : null;
    out.push(e || null);
  }
  return out;
}

export function deckAbilities() {
  return deckEntries().map(e => (e ? ability(e.id) : null));
}

export function rawPower() {
  return deckAbilities().reduce((s, a) => s + (a ? a.power : 0), 0);
}

/* Was am Ende in der Arena ankommt — inklusive Sternen aus Transzendenzen. */
export function totalPower() {
  return rawPower() * starDamage(S.stars);
}

/* Die reine Macht-Zahl ist Einzelziel-Schaden. In einer vollen Welle richten
   Flächentreffer, Kettenblitze und Brand aber deutlich mehr an — der
   Hintergrund-Rechner braucht diesen realistischeren Wert, sonst wirkt er
   viel schwächer als das, was man auf dem Bildschirm sieht. */
export function effectivePower() {
  let sum = 0;
  for (const a of deckAbilities()) {
    if (!a) continue;
    const st = a.stats;
    const splash = 1 + Math.min(1.6, st.aoe / 55) * 0.75;
    const chain  = 1 + st.chain * 0.5;
    const burn   = 1 + st.burn * 0.85;
    const pierce = 1 + st.pierce * 0.28;
    sum += a.power * splash * chain * burn * pierce;
  }
  return sum * starDamage(S.stars);
}

export function coreStats() {
  return {
    maxHp: coreHp(S.core.hp),
    regen: 1.5 + S.core.regen * 0.6,
    focusRate: 1 + S.core.focus * 0.12,
    greed: (1 + S.core.greed * 0.10) * starEssence(S.stars),
    dmgMult: starDamage(S.stars)
  };
}

export const isEquipped = (u) => S.deck.slice(0, slots()).includes(u);
export const invEntry = (u) => S.inv.find(e => e.u === u) || null;
export const codexCount = () => Object.keys(S.codex).length;

export function nextElementToUnlock() {
  return UNLOCK_ORDER.find(c => !S.unlocked.includes(c)) || null;
}

/* ---------------- Aktionen ---------------- */

export function addEssence(n) {
  S.essence += n;
  S.stats.essenceTotal += n;
  persist();
}

export function spend(n) {
  if (S.essence < n) return false;
  S.essence -= n;
  persist();
  return true;
}

function discover(id, wave) {
  const first = !S.codex[id];
  if (first) S.codex[id] = { n: 0, w: wave };
  S.codex[id].n++;
  const lvl = levelOfId(id);
  if (lvl > (S.stats.deepest || 1)) S.stats.deepest = lvl;
  return first;
}

function addToInv(id) {
  if (S.inv.length >= INV_LIMIT) return null;
  const entry = { u: uid(), id };
  S.inv.push(entry);
  return entry;
}

export function unlockElement(code) {
  if (S.unlocked.includes(code)) return { ok: false, msg: 'Schon freigeschaltet.' };
  if (nextElementToUnlock() !== code) return { ok: false, msg: 'Erst das vorherige Element freischalten.' };
  const cost = ELEMENTS[code].unlock;
  if (!spend(cost)) return { ok: false, msg: 'Zu wenig Essenz.' };
  S.unlocked.push(code);
  touch('unlock');
  return { ok: true, msg: `${ELEMENTS[code].name} freigeschaltet!` };
}

export function craftRune(code) {
  if (!S.unlocked.includes(code)) return { ok: false, msg: 'Noch nicht freigeschaltet.' };
  if (S.inv.length >= INV_LIMIT) return { ok: false, msg: 'Vorrat voll — verwerte etwas.' };
  if (!spend(ELEMENTS[code].craft)) return { ok: false, msg: 'Zu wenig Essenz.' };
  const e = addToInv(baseId(code));
  discover(baseId(code), S.wave);
  touch('inv');
  return { ok: true, entry: e };
}

export function reforge(id) {
  if (!S.codex[id]) return { ok: false, msg: 'Noch nicht entdeckt.' };
  if (S.inv.length >= INV_LIMIT) return { ok: false, msg: 'Vorrat voll — verwerte etwas.' };
  const cost = reforgeCost(id);
  if (!spend(cost)) return { ok: false, msg: `Kostet ${cost} ✦.` };
  const e = addToInv(id);
  S.codex[id].n++;
  touch('inv');
  return { ok: true, entry: e, msg: 'Nachgeschmiedet.' };
}

/* Verschmelzen: beide Zutaten werden verbraucht.
   Der Kern meldet nichts nach außen — so kann Auto-Verschmelzen viele
   Schritte am Stück machen und die Oberfläche nur einmal neu zeichnen. */
function fuseCore(uA, uB) {
  const a = invEntry(uA), b = invEntry(uB);
  if (!a || !b || a.u === b.u) return { ok: false, msg: 'Zwei verschiedene Fähigkeiten wählen.' };
  const check = canFuse(a.id, b.id);
  if (!check.ok) return { ok: false, msg: check.reason };

  const newId = fusionId(a.id, b.id);
  const wasEquipped = isEquipped(a.u) || isEquipped(b.u);

  S.inv = S.inv.filter(e => e.u !== a.u && e.u !== b.u);
  S.deck = S.deck.map(u => (u === a.u || u === b.u ? null : u));

  const entry = { u: uid(), id: newId };
  S.inv.push(entry);
  const isNew = discover(newId, S.wave);
  S.stats.fusions++;

  /* Frei gewordenen Platz gleich mit dem Ergebnis füllen — das ist fast
     immer, was man will. */
  const free = S.deck.slice(0, slots()).indexOf(null);
  if (wasEquipped && free >= 0) S.deck[free] = entry.u;

  return { ok: true, entry, ability: ability(newId), isNew };
}

export function doFuse(uA, uB) {
  const res = fuseCore(uA, uB);
  if (res.ok) touch('fuse');
  return res;
}

/* ---------------- Auto-Verschmelzen ---------------- *
   Nur gleiche, NICHT ausgerüstete Fähigkeiten werden zusammengelegt. Wer
   zwei identische Fähigkeiten nebeneinander laufen lassen will, rüstet sie
   aus — dann fasst sie niemand an. */
export function autoMergeAll(limit = 60) {
  let merged = 0, discovered = 0, best = null;
  for (let k = 0; k < limit; k++) {
    const seenIds = new Map();
    let pair = null;
    for (const e of S.inv) {
      if (isEquipped(e.u)) continue;
      if (seenIds.has(e.id)) { pair = [seenIds.get(e.id), e.u]; break; }
      seenIds.set(e.id, e.u);
    }
    if (!pair) break;
    const res = fuseCore(pair[0], pair[1]);
    if (!res.ok) break;
    merged++;
    if (res.isNew) discovered++;
    if (!best || res.ability.power > best.power) best = res.ability;
  }
  if (merged) touch('fuse');
  return { merged, discovered, best };
}

/* Sicherheitsnetz: ohne Fähigkeit und ohne Essenz käme man nie wieder in
   Gang — dann gibt es eine Feuerrune aufs Haus. */
export function ensureNotStuck() {
  const cheapest = Math.min(...S.unlocked.map(c => ELEMENTS[c].craft));
  if (S.inv.length === 0 && S.essence < cheapest) {
    S.inv.push({ u: uid(), id: baseId('FE') });
    S.deck[0] = S.inv[0].u;
    return true;
  }
  return false;
}

export function dissolve(u) {
  const e = invEntry(u);
  if (!e) return { ok: false };
  const gain = Math.round(reforgeCost(e.id) * 0.55);
  S.inv = S.inv.filter(x => x.u !== u);
  S.deck = S.deck.map(x => (x === u ? null : x));
  addEssence(gain);
  ensureNotStuck();
  touch('inv');
  return { ok: true, gain };
}

export function equip(u, slot) {
  const max = slots();
  if (slot == null) {
    slot = S.deck.slice(0, max).indexOf(null);
    if (slot < 0) slot = 0;
  }
  if (slot >= max) return { ok: false, msg: 'Platz noch gesperrt.' };
  const existing = S.deck.indexOf(u);
  if (existing >= 0) S.deck[existing] = null;
  while (S.deck.length < max) S.deck.push(null);
  S.deck[slot] = u;
  touch('deck');
  return { ok: true };
}

/* Die stärksten Fähigkeiten aus dem Vorrat auf alle freien Plätze legen.
   Praktisch nach dem Auto-Verschmelzen — sonst kämpft man mit Funken weiter,
   während im Vorrat ein Monstrum liegt. */
export function equipBest() {
  const max = slots();
  const ranked = S.inv.slice().sort((a, b) => ability(b.id).power - ability(a.id).power);
  const chosen = ranked.slice(0, max).map(e => e.u);
  const before = S.deck.slice(0, max).join(',');
  while (S.deck.length < max) S.deck.push(null);
  for (let i = 0; i < max; i++) S.deck[i] = chosen[i] || null;
  const changed = S.deck.slice(0, max).join(',') !== before;
  if (changed) touch('deck');
  return { ok: true, changed, n: chosen.length };
}

export function unequip(slot) {
  if (S.deck[slot]) { S.deck[slot] = null; touch('deck'); }
}

export function buyUpgrade(key) {
  const u = CORE_UPGRADES[key];
  const lv = S.core[key] || 0;
  if (lv >= u.max) return { ok: false, msg: 'Maximal ausgebaut.' };
  const cost = upgradeCost(key, lv);
  if (!spend(cost)) return { ok: false, msg: `Kostet ${cost} ✦.` };
  S.core[key] = lv + 1;
  touch('core');
  return { ok: true, msg: `${u.name} Stufe ${lv + 1}` };
}

export function setWave(w) {
  S.wave = clamp(Math.round(w), 1, 9999);
  if (S.wave > S.bestWave) S.bestWave = S.wave;
  persist();
}

export function onWaveCleared(w) {
  setWave(w + 1);
  emit('wave');
}

/* Nach einer Niederlage geht es am Anfang des aktuellen Fünferblocks weiter —
   Essenz bleibt erhalten, Fortschritt wird nie ganz zurückgesetzt. */
export function onDefeat(w) {
  const zoneStart = w - ((w - 1) % 5);
  S.wave = Math.max(1, zoneStart);
  persist();
  emit('wave');
}

export function addKill() { S.stats.kills++; }

/* ---------------- Meilensteine ---------------- */
export function checkMilestones() {
  const view = {
    bestWave: S.bestWave,
    codexN: codexCount(),
    deepest: S.stats.deepest || 1,
    unlocked: S.unlocked.length,
    kills: S.stats.kills
  };
  const done = [];
  for (const m of MILESTONES) {
    if (S.mile[m.id] || !m.test(view)) continue;
    S.mile[m.id] = 1;
    S.essence += m.reward;
    S.stats.essenceTotal += m.reward;
    done.push(m);
  }
  if (done.length) persist();
  return done;
}

export const milestoneProgress = () => ({
  done: MILESTONES.filter(m => S.mile[m.id]).length,
  total: MILESTONES.length
});

/* ---------------- Transzendenz ---------------- *
   Alles zurück auf Anfang, aber die Elemente bleiben freigeschaltet und der
   Kodex bleibt vollständig — ein neuer Lauf ist dadurch deutlich schneller. */
export const canTranscend = () => S.bestWave >= TRANSCEND_WAVE;
export const transcendGain = () => Math.max(0, starsFor(S.bestWave) - S.stars);

export function transcend() {
  if (!canTranscend()) return { ok: false, msg: `Erst ab Welle ${TRANSCEND_WAVE}.` };
  const gain = transcendGain();
  if (gain <= 0) return { ok: false, msg: 'Komm erst weiter als beim letzten Mal.' };

  S.stars += gain;
  S.prestiges++;
  S.essence = 0;
  S.wave = 1;
  S.bestWave = 1;
  S.core = { hp: 0, regen: 0, focus: 0, greed: 0 };
  const start = [{ u: uid(), id: baseId('FE') }, { u: uid(), id: baseId('WA') }];
  S.inv = start;
  S.deck = [start[0].u, start[1].u];
  touch('all');
  return { ok: true, gain, stars: S.stars };
}
