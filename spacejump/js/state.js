// Spielstand: Münzen, Rekorde, Skins, Missionen, Einstellungen.

const KEY = 'novaleap:v1';

const DEFAULTS = () => ({
  coins: 0,
  best: 0,
  bestSector: 1,
  runs: 0,
  skin: 'pionier',
  owned: ['pionier'],
  totals: { meters: 0, coins: 0, drones: 0, boosts: 0, platforms: 0, canisters: 0 },
  missions: {},
  settings: { sfx: true, music: true, control: 'auto', shake: true, trail: true },
  seenIntro: false,
});

let data = DEFAULTS();

export const MISSIONS = [
  { id: 'm500', name: 'Erster Abschub', desc: '500 m in einem Lauf', reward: 60, check: (d, r) => r.meters >= 500 },
  { id: 'm1500', name: 'Über den Gürtel', desc: '1 500 m in einem Lauf', reward: 150, check: (d, r) => r.meters >= 1500 },
  { id: 'm3000', name: 'Tief im Nebel', desc: '3 000 m in einem Lauf', reward: 320, check: (d, r) => r.meters >= 3000 },
  { id: 'm6000', name: 'Jenseits der Karte', desc: '6 000 m in einem Lauf', reward: 700, check: (d, r) => r.meters >= 6000 },
  { id: 'sec4', name: 'Kartograf', desc: 'Sektor 4 erreichen', reward: 200, check: (d, r) => r.sector >= 4 },
  { id: 'sec6', name: 'Grenzgänger', desc: 'Sektor 6 erreichen', reward: 450, check: (d, r) => r.sector >= 6 },
  { id: 'drone20', name: 'Störungsfrei', desc: '20 Drohnen abschießen', reward: 120, check: (d) => d.totals.drones >= 20 },
  { id: 'drone100', name: 'Wachdienst', desc: '100 Drohnen abschießen', reward: 400, check: (d) => d.totals.drones >= 100 },
  { id: 'coin500', name: 'Schürfrechte', desc: '500 Münzen einsammeln', reward: 150, check: (d) => d.totals.coins >= 500 },
  { id: 'coin2500', name: 'Sternenkasse', desc: '2 500 Münzen einsammeln', reward: 600, check: (d) => d.totals.coins >= 2500 },
  { id: 'boost30', name: 'Zündstoff', desc: '30 Schubdüsen zünden', reward: 180, check: (d) => d.totals.boosts >= 30 },
  { id: 'o2_40', name: 'Luft anhalten', desc: '40 O₂-Kanister bergen', reward: 220, check: (d) => d.totals.canisters >= 40 },
];

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = deepMerge(DEFAULTS(), parsed);
    }
  } catch (e) {
    data = DEFAULTS();
  }
  if (!data.owned.includes('pionier')) data.owned.push('pionier');
  if (!data.owned.includes(data.skin)) data.skin = 'pionier';
  return data;
}

function deepMerge(base, over) {
  if (over === null || over === undefined) return base;
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (typeof base !== 'object') return typeof over === typeof base ? over : base;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (k in over) out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* voll oder privat */ }
  }, 120);
}

export const get = () => data;

export function addCoins(n) {
  data.coins += n;
  save();
}

export function ownSkin(id) {
  if (!data.owned.includes(id)) data.owned.push(id);
  save();
}

export function selectSkin(id) {
  data.skin = id;
  save();
}

export function setSetting(key, value) {
  data.settings[key] = value;
  save();
}

/**
 * Lauf verbuchen. Gibt zurück, was danach zu feiern ist:
 * { record, missions:[...], earned }
 */
export function finishRun(run) {
  data.runs++;
  data.totals.meters += run.meters;
  data.totals.coins += run.coins;
  data.totals.drones += run.drones;
  data.totals.boosts += run.boosts;
  data.totals.platforms += run.platforms;
  data.totals.canisters += run.canisters;
  data.coins += run.coins;

  const record = run.meters > data.best;
  if (record) data.best = Math.floor(run.meters);
  if (run.sector > data.bestSector) data.bestSector = run.sector;

  const done = [];
  for (const m of MISSIONS) {
    if (data.missions[m.id]) continue;
    if (m.check(data, run)) {
      data.missions[m.id] = true;
      data.coins += m.reward;
      done.push(m);
    }
  }
  save();
  return { record, missions: done };
}

export function resetAll() {
  data = DEFAULTS();
  save();
}
