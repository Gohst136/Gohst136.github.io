/* AETHERFORGE — Stammdaten: Elemente, Rezepte, Namensbausteine, Gegner.
   Dieses Modul ist rein (kein DOM), damit es auch in Tests laufen kann. */

/* ------------------------------------------------------------------ *
 * ELEMENTE
 * code      : kurzer Schlüssel, taucht in jeder Fähigkeits-ID auf
 * mod       : Statgewichte, werden nach Elementanteil verrechnet
 * unlock    : einmalige Freischaltkosten in Essenz
 * craft     : Kosten pro geschmiedeter Basisrune
 * ------------------------------------------------------------------ */
export const ELEMENTS = {
  FE: {
    code: 'FE', name: 'Feuer', sigil: '🜂', order: 0,
    colors: ['#ff9d2f', '#ff2d55'], effect: 'brand',
    effectName: 'Brand', effectDesc: 'Setzt Ziele in Flammen (Schaden über Zeit).',
    shot: 'orb',
    mod: { dmg: 0.60, cd: 0.00, crit: 0.02, aoe: 0.35, count: 0 },
    unlock: 0, craft: 8,
    lore: 'Der erste Funke. Roh, gierig, unaufhaltsam.'
  },
  WA: {
    code: 'WA', name: 'Wasser', sigil: '🜄', order: 1,
    colors: ['#38f0d8', '#2a7bff'], effect: 'frost',
    effectName: 'Frost', effectDesc: 'Verlangsamt getroffene Gegner deutlich.',
    shot: 'orb',
    mod: { dmg: 0.18, cd: -0.06, crit: 0.02, aoe: 0.55, count: 0 },
    unlock: 0, craft: 8,
    lore: 'Geduldig. Formt Stein, ohne je die Stimme zu heben.'
  },
  BL: {
    code: 'BL', name: 'Blitz', sigil: '🜍', order: 2,
    colors: ['#7df9ff', '#4d5bff'], effect: 'schock',
    effectName: 'Schock', effectDesc: 'Springt auf ein weiteres Ziel über.',
    shot: 'bolt',
    mod: { dmg: 0.10, cd: -0.38, crit: 0.14, aoe: 0.10, count: 0.5 },
    unlock: 60, craft: 14,
    lore: 'Zwischen zwei Herzschlägen bereits vorbei.'
  },
  ER: {
    code: 'ER', name: 'Erde', sigil: '🜃', order: 3,
    colors: ['#c9a227', '#7a4a20'], effect: 'splitter',
    effectName: 'Splitter', effectDesc: 'Zersplittert und trifft alles im Umkreis.',
    shot: 'shard',
    mod: { dmg: 0.95, cd: 0.48, crit: -0.02, aoe: 0.85, count: 0 },
    unlock: 150, craft: 22,
    lore: 'Was die Erde nimmt, gibt sie niemals zurück.'
  },
  WI: {
    code: 'WI', name: 'Wind', sigil: '🜁', order: 4,
    colors: ['#b6ffce', '#37d67a'], effect: 'schnitt',
    effectName: 'Schnitt', effectDesc: 'Durchdringt Gegner, statt zu zerplatzen.',
    shot: 'blade',
    mod: { dmg: -0.10, cd: -0.30, crit: 0.08, aoe: -0.10, count: 1.0 },
    unlock: 320, craft: 30,
    lore: 'Tausend Klingen, von denen keine ein Gewicht hat.'
  },
  LI: {
    code: 'LI', name: 'Licht', sigil: '🜚', order: 5,
    colors: ['#fff3a8', '#ffb020'], effect: 'sengen',
    effectName: 'Sengen', effectDesc: 'Erhöhter Kritischer Schaden, durchbohrt Reihen.',
    shot: 'beam',
    mod: { dmg: 0.30, cd: -0.10, crit: 0.16, aoe: 0.15, count: 0 },
    unlock: 650, craft: 45,
    lore: 'Nichts blendet so zuverlässig wie die Wahrheit.'
  },
  SC: {
    code: 'SC', name: 'Schatten', sigil: '🜏', order: 6,
    colors: ['#b06bff', '#3a0f6b'], effect: 'zehren',
    effectName: 'Zehren', effectDesc: 'Ein Teil des Schadens heilt deinen Kern.',
    shot: 'wisp',
    mod: { dmg: 0.48, cd: -0.05, crit: 0.10, aoe: 0.10, count: 0 },
    unlock: 1200, craft: 65,
    lore: 'Er wartet nicht auf die Nacht. Er bringt sie mit.'
  },
  AR: {
    code: 'AR', name: 'Arkan', sigil: '🜛', order: 7,
    colors: ['#ff8ae2', '#8a4dff'], effect: 'echo',
    effectName: 'Echo', effectDesc: 'Chance, den gesamten Angriff zu wiederholen.',
    shot: 'rune',
    mod: { dmg: 0.32, cd: -0.16, crit: 0.09, aoe: 0.30, count: 0.3 },
    unlock: 2200, craft: 90,
    lore: 'Die Sprache, in der die Welt geschrieben wurde.'
  }
};

export const ELEMENT_CODES = Object.keys(ELEMENTS).sort(
  (a, b) => ELEMENTS[a].order - ELEMENTS[b].order
);

/* Reihenfolge, in der Elemente freigeschaltet werden können. */
export const UNLOCK_ORDER = ['FE', 'WA', 'BL', 'ER', 'WI', 'LI', 'SC', 'AR'];

/* ------------------------------------------------------------------ *
 * SELTENHEITS-STUFEN — abgeleitet aus der Anzahl verschmolzener Runen
 * ------------------------------------------------------------------ */
export const TIERS = [
  { min: 1,  max: 1,   name: 'Gewöhnlich', roman: 'I',   color: '#9aa4b8', glow: 0.15, prefix: '' },
  { min: 2,  max: 2,   name: 'Selten',     roman: 'II',  color: '#4fa8ff', glow: 0.30, prefix: '' },
  { min: 3,  max: 4,   name: 'Episch',     roman: 'III', color: '#b06bff', glow: 0.48, prefix: '' },
  { min: 5,  max: 8,   name: 'Legendär',   roman: 'IV',  color: '#ffc247', glow: 0.66, prefix: '' },
  { min: 9,  max: 14,  name: 'Mythisch',   roman: 'V',   color: '#ff5b8a', glow: 0.82, prefix: 'Ur-' },
  { min: 15, max: 24,  name: 'Kosmisch',   roman: 'VI',  color: '#42f5e0', glow: 0.94, prefix: 'Äon-' },
  { min: 25, max: 999, name: 'Göttlich',   roman: 'VII', color: '#ffffff', glow: 1.00, prefix: 'Omega-' }
];

export function tierOf(level) {
  for (const t of TIERS) if (level >= t.min && level <= t.max) return t;
  return TIERS[TIERS.length - 1];
}

/* ------------------------------------------------------------------ *
 * HANDGESCHRIEBENE NAMEN
 * Schlüssel ist die Fähigkeits-ID (siehe fusion.js → signatureId)
 * ------------------------------------------------------------------ */
export const NAMED = {
  /* Basisrunen */
  'FE1': 'Glutfunke',       'WA1': 'Flutstoß',        'BL1': 'Funkenschlag',
  'ER1': 'Steinsplitter',   'WI1': 'Klingenbö',       'LI1': 'Lichtstrahl',
  'SC1': 'Schattendolch',   'AR1': 'Runenschlag',

  /* Reine Doppelungen */
  'FE2': 'Infernokern',     'WA2': 'Abyssalkern',     'BL2': 'Sturmkern',
  'ER2': 'Titankern',       'WI2': 'Orkankern',       'LI2': 'Novakern',
  'SC2': 'Voidkern',        'AR2': 'Omegakern',

  /* Alle 28 Basispaare */
  'FE1.WA1': 'Dampfstoß',    'BL1.FE1': 'Plasmalanze',  'ER1.FE1': 'Magmabruch',
  'FE1.WI1': 'Feuersturm',   'FE1.LI1': 'Sonnenbrand',  'FE1.SC1': 'Höllenglut',
  'AR1.FE1': 'Phönixsiegel', 'BL1.WA1': 'Sturmflut',    'ER1.WA1': 'Schlammlawine',
  'WA1.WI1': 'Nebelschneide','LI1.WA1': 'Prismenwelle', 'SC1.WA1': 'Abyssalsog',
  'AR1.WA1': 'Kristallquell','BL1.ER1': 'Tektonikpuls', 'BL1.WI1': 'Donnerorkan',
  'BL1.LI1': 'Ionenblitz',   'BL1.SC1': 'Voltverfall',  'AR1.BL1': 'Arkanschock',
  'ER1.WI1': 'Sandsturm',    'ER1.LI1': 'Erzglanz',     'ER1.SC1': 'Basaltgruft',
  'AR1.ER1': 'Titanensiegel','LI1.WI1': 'Aurorabö',     'SC1.WI1': 'Nachtschneide',
  'AR1.WI1': 'Ätherwirbel',  'LI1.SC1': 'Eklipse',      'AR1.LI1': 'Halosiegel',
  'AR1.SC1': 'Leerenruf',

  /* Ein paar ikonische tiefere Rezepte als Belohnung fürs Suchen */
  'FE2.WI2': 'Weltenbrand',        'BL2.WA2': 'Kaiserflut',
  'LI2.SC2': 'Totale Finsternis',  'AR2.ER2': 'Fundament der Welt',
  'AR1.BL1.FE1.WA1': 'Vier Siegel','FE1.LI1.SC1.WA1': 'Zwielichtbrand',
  'AR2.FE2.LI2': 'Sonnenkathedrale','AR2.BL2.SC2': 'Nullpunkt',
  'AR1.BL1.ER1.FE1.LI1.SC1.WA1.WI1': 'Genesis'
};

/* ------------------------------------------------------------------ *
 * PROZEDURALE NAMEN
 * ------------------------------------------------------------------ */
export const PREFIX = {
  FE: ['Glut', 'Flammen', 'Magma', 'Aschen', 'Phönix', 'Infernal'],
  WA: ['Flut', 'Tiefen', 'Abyss', 'Nebel', 'Gezeiten', 'Frost'],
  BL: ['Volt', 'Donner', 'Plasma', 'Ionen', 'Ketten', 'Sturm'],
  ER: ['Fels', 'Basalt', 'Erz', 'Tektonik', 'Titanen', 'Grav'],
  WI: ['Zephyr', 'Orkan', 'Klingen', 'Schall', 'Vakuum', 'Sichel'],
  LI: ['Prisma', 'Solar', 'Aurora', 'Heiligen', 'Strahlen', 'Nova'],
  SC: ['Nacht', 'Void', 'Leeren', 'Wraith', 'Blut', 'Eklipsen'],
  AR: ['Runen', 'Äther', 'Zeit', 'Chaos', 'Sigil', 'Omega']
};

export const CORE = {
  FE: ['nova', 'zorn', 'brand', 'eruption'],
  WA: ['kaskade', 'welle', 'flut', 'strudel'],
  BL: ['puls', 'salve', 'entladung', 'schlag'],
  ER: ['faust', 'wall', 'bruch', 'koloss'],
  WI: ['sturm', 'schneide', 'wirbel', 'böe'],
  LI: ['strahl', 'glanz', 'halo', 'krone'],
  SC: ['schlund', 'klaue', 'riss', 'schleier'],
  AR: ['siegel', 'formel', 'kreis', 'echo']
};

/* ------------------------------------------------------------------ *
 * KERN-UPGRADES (die zweite Fortschrittsachse)
 * ------------------------------------------------------------------ */
export const CORE_UPGRADES = {
  hp:    { name: 'Kernhülle',  desc: '+18 % Kern-Leben',       icon: '❤', base: 40,  growth: 1.55, max: 40 },
  regen: { name: 'Regeneration', desc: '+0.6 Leben / Sekunde', icon: '✚', base: 65,  growth: 1.60, max: 30 },
  focus: { name: 'Fokuslinse', desc: 'Fokus lädt 12 % schneller', icon: '◎', base: 90, growth: 1.62, max: 25 },
  greed: { name: 'Essenzgier', desc: '+10 % Essenz aus Kämpfen', icon: '✦', base: 110, growth: 1.66, max: 30 }
};

export function upgradeCost(key, level) {
  const u = CORE_UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, level));
}

/* ------------------------------------------------------------------ *
 * GEGNER
 * ------------------------------------------------------------------ */
export const ENEMY_TYPES = [
  { id: 'wicht',  name: 'Wicht',    hp: 0.70, speed: 1.35, dmg: 0.7, r: 15, sides: 3, color: '#7fe0a8', from: 1 },
  { id: 'drohne', name: 'Drohne',   hp: 1.00, speed: 1.00, dmg: 1.0, r: 18, sides: 4, color: '#7db4ff', from: 1 },
  { id: 'brut',   name: 'Brutling', hp: 0.85, speed: 1.15, dmg: 0.9, r: 16, sides: 5, color: '#ff9ad1', from: 4 },
  { id: 'golem',  name: 'Golem',    hp: 2.30, speed: 0.62, dmg: 1.7, r: 25, sides: 6, color: '#d8b46a', from: 7 },
  { id: 'wraith', name: 'Wraith',   hp: 1.30, speed: 1.45, dmg: 1.2, r: 19, sides: 3, color: '#b98cff', from: 11 },
  { id: 'koloss', name: 'Koloss',   hp: 4.20, speed: 0.50, dmg: 2.4, r: 32, sides: 7, color: '#ff8b6a', from: 16 }
];

export const BOSS_NAMES = [
  'Aschenherz', 'Der Tiefenwächter', 'Sturmvater', 'Steingeborener Tyrann',
  'Orkanfürst', 'Sonnenrichter', 'Leerenfresser', 'Der Runenkönig',
  'Weltenkeim', 'Das Letzte Auge'
];

/* Wellen-Mathematik ------------------------------------------------- */
export const isBossWave = (w) => w % 5 === 0;

export function enemyHp(wave) {
  return Math.round(22 * Math.pow(wave, 1.5) * Math.pow(1.07, wave) + 16);
}
export function enemyDamage(wave) {
  return Math.round(6 + wave * 2.6 + Math.pow(wave, 1.35));
}
export function enemyCount(wave) {
  return Math.min(26, 4 + Math.floor(wave * 0.9));
}
export function essencePerKill(wave) {
  return 3 + wave * 1.6;
}
export function waveBonus(wave) {
  return Math.round(18 + wave * 9 + Math.pow(wave, 1.5));
}
/* Bosse sollen eine Wand sein, an der man einmal aufrüstet — keine Mauer. */
export const BOSS_HP_MULT = 4;
export function coreHp(level) {
  return Math.round(220 * Math.pow(1.18, level));
}

/* ------------------------------------------------------------------ *
 * GEGNER-EIGENSCHAFTEN
 * Ab mittleren Wellen bekommen Gegner Zusätze. Sie machen die Kämpfe
 * unterschiedlich, ohne dass man etwas dazulernen müsste — man sieht sie.
 * ------------------------------------------------------------------ */
export const AFFIXES = {
  panzer: {
    name: 'Gepanzert', short: 'PZR', from: 8, weight: 3,
    color: '#c9d4e6', desc: 'Nimmt 40 % weniger Schaden.'
  },
  flink: {
    name: 'Flink', short: 'FLK', from: 6, weight: 3,
    color: '#8affc1', desc: 'Deutlich schneller unterwegs.'
  },
  teilend: {
    name: 'Teilend', short: 'TLD', from: 12, weight: 2,
    color: '#ff9ad1', desc: 'Zerfällt beim Tod in zwei Kleine.'
  },
  zaeh: {
    name: 'Zäh', short: 'ZAH', from: 16, weight: 2,
    color: '#ffc247', desc: 'Doppelte Lebenspunkte, dafür träge.'
  }
};

/* Wahrscheinlichkeit, dass ein Gegner überhaupt eine Eigenschaft bekommt. */
export function affixChance(wave) {
  return Math.min(0.55, Math.max(0, (wave - 5) * 0.028));
}

/* ------------------------------------------------------------------ *
 * TRANSZENDENZ (Prestige)
 * ------------------------------------------------------------------ */
export const TRANSCEND_WAVE = 25;

export function starsFor(bestWave) {
  if (bestWave < TRANSCEND_WAVE) return 0;
  return Math.floor(3 * Math.pow(bestWave / TRANSCEND_WAVE, 1.4));
}
export const starDamage  = (stars) => 1 + stars * 0.12;
export const starEssence = (stars) => 1 + stars * 0.08;

/* ------------------------------------------------------------------ *
 * MEILENSTEINE — kleine Ziele mit Essenzbelohnung
 * ------------------------------------------------------------------ */
export const MILESTONES = [
  { id: 'w5',    name: 'Erster Boss',        desc: 'Erreiche Welle 5',            test: s => s.bestWave >= 5,     reward: 120 },
  { id: 'w10',   name: 'Zehn Wellen',        desc: 'Erreiche Welle 10',           test: s => s.bestWave >= 10,    reward: 400 },
  { id: 'w20',   name: 'Tief im Sturm',      desc: 'Erreiche Welle 20',           test: s => s.bestWave >= 20,    reward: 1800 },
  { id: 'w35',   name: 'Unaufhaltsam',       desc: 'Erreiche Welle 35',           test: s => s.bestWave >= 35,    reward: 9000 },
  { id: 'w50',   name: 'Legende der Arena',  desc: 'Erreiche Welle 50',           test: s => s.bestWave >= 50,    reward: 40000 },
  { id: 'c15',   name: 'Sammler',            desc: '15 Fähigkeiten im Kodex',     test: s => s.codexN >= 15,      reward: 250 },
  { id: 'c40',   name: 'Archivar',           desc: '40 Fähigkeiten im Kodex',     test: s => s.codexN >= 40,      reward: 1500 },
  { id: 'c80',   name: 'Chronist',           desc: '80 Fähigkeiten im Kodex',     test: s => s.codexN >= 80,      reward: 8000 },
  { id: 'd8',    name: 'Achtfach',           desc: 'Eine Fusion aus 8 Runen',     test: s => s.deepest >= 8,      reward: 300 },
  { id: 'd16',   name: 'Sechzehnfach',       desc: 'Eine Fusion aus 16 Runen',    test: s => s.deepest >= 16,     reward: 2500 },
  { id: 'd32',   name: 'Zweiunddreißig',     desc: 'Eine Fusion aus 32 Runen',    test: s => s.deepest >= 32,     reward: 20000 },
  { id: 'all8',  name: 'Vollständig',        desc: 'Alle acht Elemente besitzen', test: s => s.unlocked >= 8,     reward: 1200 },
  { id: 'k500',  name: 'Fünfhundert',        desc: '500 Gegner besiegt',          test: s => s.kills >= 500,      reward: 900 },
  { id: 'k5000', name: 'Fünftausend',        desc: '5000 Gegner besiegt',         test: s => s.kills >= 5000,     reward: 12000 }
];

/* ------------------------------------------------------------------ *
 * HINTERGRUND / OFFLINE
 * ------------------------------------------------------------------ */
export const MAX_OFFLINE_SECONDS = 8 * 3600;   /* länger bringt nichts mehr */
export const TRAVEL_SECONDS = 14;              /* wie lange ein Gegner bis zum Kern braucht */
