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
    unlock: 0, minWave: 1, craft: 6,
    lore: 'Der erste Funke. Roh, gierig, unaufhaltsam.'
  },
  WA: {
    code: 'WA', name: 'Wasser', sigil: '🜄', order: 1,
    colors: ['#38f0d8', '#2a7bff'], effect: 'frost',
    effectName: 'Frost', effectDesc: 'Verlangsamt getroffene Gegner deutlich.',
    shot: 'orb',
    mod: { dmg: 0.18, cd: -0.06, crit: 0.02, aoe: 0.55, count: 0 },
    unlock: 0, minWave: 1, craft: 6,
    lore: 'Geduldig. Formt Stein, ohne je die Stimme zu heben.'
  },
  BL: {
    code: 'BL', name: 'Blitz', sigil: '🜍', order: 2,
    colors: ['#7df9ff', '#4d5bff'], effect: 'schock',
    effectName: 'Schock', effectDesc: 'Springt auf ein weiteres Ziel über.',
    shot: 'bolt',
    mod: { dmg: 0.10, cd: -0.38, crit: 0.14, aoe: 0.10, count: 0.5 },
    unlock: 150, minWave: 4, craft: 10,
    lore: 'Zwischen zwei Herzschlägen bereits vorbei.'
  },
  ER: {
    code: 'ER', name: 'Erde', sigil: '🜃', order: 3,
    colors: ['#c9a227', '#7a4a20'], effect: 'splitter',
    effectName: 'Splitter', effectDesc: 'Zersplittert und trifft alles im Umkreis.',
    shot: 'shard',
    mod: { dmg: 0.95, cd: 0.48, crit: -0.02, aoe: 0.85, count: 0 },
    unlock: 900, minWave: 8, craft: 17,
    lore: 'Was die Erde nimmt, gibt sie niemals zurück.'
  },
  WI: {
    code: 'WI', name: 'Wind', sigil: '🜁', order: 4,
    colors: ['#b6ffce', '#37d67a'], effect: 'schnitt',
    effectName: 'Schnitt', effectDesc: 'Durchdringt Gegner, statt zu zerplatzen.',
    shot: 'blade',
    mod: { dmg: -0.10, cd: -0.30, crit: 0.08, aoe: -0.10, count: 1.0 },
    unlock: 4500, minWave: 13, craft: 26,
    lore: 'Tausend Klingen, von denen keine ein Gewicht hat.'
  },
  LI: {
    code: 'LI', name: 'Licht', sigil: '🜚', order: 5,
    colors: ['#fff3a8', '#ffb020'], effect: 'sengen',
    effectName: 'Sengen', effectDesc: 'Erhöhter Kritischer Schaden, durchbohrt Reihen.',
    shot: 'beam',
    mod: { dmg: 0.30, cd: -0.10, crit: 0.16, aoe: 0.15, count: 0 },
    unlock: 22000, minWave: 19, craft: 40,
    lore: 'Nichts blendet so zuverlässig wie die Wahrheit.'
  },
  SC: {
    code: 'SC', name: 'Schatten', sigil: '🜏', order: 6,
    colors: ['#b06bff', '#3a0f6b'], effect: 'zehren',
    effectName: 'Zehren', effectDesc: 'Ein Teil des Schadens heilt deinen Kern.',
    shot: 'wisp',
    mod: { dmg: 0.48, cd: -0.05, crit: 0.10, aoe: 0.10, count: 0 },
    unlock: 110000, minWave: 26, craft: 62,
    lore: 'Er wartet nicht auf die Nacht. Er bringt sie mit.'
  },
  AR: {
    code: 'AR', name: 'Arkan', sigil: '🜛', order: 7,
    colors: ['#ff8ae2', '#8a4dff'], effect: 'echo',
    effectName: 'Echo', effectDesc: 'Chance, den gesamten Angriff zu wiederholen.',
    shot: 'rune',
    mod: { dmg: 0.32, cd: -0.16, crit: 0.09, aoe: 0.30, count: 0.3 },
    unlock: 600000, minWave: 34, craft: 95,
    lore: 'Die Sprache, in der die Welt geschrieben wurde.'
  }
};

/* ------------------------------------------------------------------ *
 * FREMDRUNEN
 * Gibt es nirgends zu kaufen — nur beim Händler, der alle paar Minuten
 * vorbeikommt und jedes Stück nur ein- oder zweimal dabei hat. Sie
 * verschmelzen wie alles andere, bringen aber Mechaniken mit, die kein
 * Grundelement hat.
 * ------------------------------------------------------------------ */
export const SPECIALS = {
  IS: {
    code: 'IS', name: 'Eis', order: 8, special: true,
    colors: ['#dff6ff', '#4aa8ff'], effect: 'starre',
    effectName: 'Starre', effectDesc: 'Friert Gegner für einen Moment völlig ein.',
    shot: 'orb',
    mod: { dmg: 0.30, cd: 0.06, crit: 0.04, aoe: 0.45, count: 0 },
    craft: 900, tier: 1,
    lore: 'Kälte, die nicht nur bremst, sondern beschließt, dass Bewegung aufhört.'
  },
  GI: {
    code: 'GI', name: 'Gift', order: 9, special: true,
    colors: ['#b6ff3a', '#2f7a1f'], effect: 'seuche',
    effectName: 'Seuche', effectDesc: 'Vergiftung stapelt sich und wird immer stärker.',
    shot: 'wisp',
    mod: { dmg: 0.15, cd: -0.18, crit: 0.05, aoe: 0.25, count: 0.2 },
    craft: 900, tier: 1,
    lore: 'Sie tötet nicht schnell. Sie tötet zuverlässig.'
  },
  ZE: {
    code: 'ZE', name: 'Zeit', order: 10, special: true,
    colors: ['#ffe9a8', '#7de3ff'], effect: 'raffung',
    effectName: 'Raffung', effectDesc: 'Chance, die Abklingzeit sofort zurückzusetzen.',
    shot: 'rune',
    mod: { dmg: 0.12, cd: -0.55, crit: 0.08, aoe: 0.05, count: 0.2 },
    craft: 1400, tier: 2,
    lore: 'Zwei Schläge in derselben Sekunde. Frag nicht, welcher zuerst kam.'
  },
  VO: {
    code: 'VO', name: 'Leere', order: 11, special: true,
    colors: ['#8a6bff', '#120426'], effect: 'entwehr',
    effectName: 'Entwehr', effectDesc: 'Ignoriert Panzerung und trifft Bosse härter.',
    shot: 'beam',
    mod: { dmg: 0.75, cd: 0.02, crit: 0.10, aoe: 0.15, count: 0 },
    craft: 1400, tier: 2,
    lore: 'Wo nichts ist, kann sich auch nichts dazwischenstellen.'
  },
  KR: {
    code: 'KR', name: 'Kristall', order: 12, special: true,
    colors: ['#ffd8f8', '#8affe6'], effect: 'brechung',
    effectName: 'Brechung', effectDesc: 'Durchbohrt Reihen und trifft kritisch viel härter.',
    shot: 'blade',
    mod: { dmg: 0.25, cd: -0.12, crit: 0.22, aoe: 0.10, count: 0.6 },
    craft: 2200, tier: 3,
    lore: 'Ein Schnitt, siebenfach gespiegelt.'
  },
  SN: {
    code: 'SN', name: 'Stern', order: 13, special: true,
    colors: ['#fff6d0', '#ff9d2f'], effect: 'nova',
    effectName: 'Nova', effectDesc: 'Langsam, aber jeder Treffer reißt ein Loch in die Welle.',
    shot: 'orb',
    mod: { dmg: 1.05, cd: 0.38, crit: 0.06, aoe: 1.35, count: 0 },
    craft: 2200, tier: 3,
    lore: 'Etwas, das einmal eine Sonne war, passt jetzt in deine Hand.'
  }
};

Object.assign(ELEMENTS, SPECIALS);
export const SPECIAL_CODES = Object.keys(SPECIALS);
export const isSpecial = (code) => !!(ELEMENTS[code] && ELEMENTS[code].special);

export const ELEMENT_CODES = Object.keys(ELEMENTS).sort(
  (a, b) => ELEMENTS[a].order - ELEMENTS[b].order
);

/* Reihenfolge, in der Elemente freigeschaltet werden können. */
export const UNLOCK_ORDER = ['FE', 'WA', 'BL', 'ER', 'WI', 'LI', 'SC', 'AR'];

/* ------------------------------------------------------------------ *
 * SELTENHEITS-STUFEN — abgeleitet aus der Anzahl verschmolzener Runen
 * ------------------------------------------------------------------ */
export const TIERS = [
  { min: 1,   max: 1,    name: 'Gewöhnlich',   roman: 'I',    color: '#9aa4b8', glow: 0.15, prefix: '' },
  { min: 2,   max: 2,    name: 'Selten',       roman: 'II',   color: '#4fa8ff', glow: 0.28, prefix: '' },
  { min: 3,   max: 4,    name: 'Episch',       roman: 'III',  color: '#b06bff', glow: 0.42, prefix: '' },
  { min: 5,   max: 8,    name: 'Legendär',     roman: 'IV',   color: '#ffc247', glow: 0.56, prefix: '' },
  { min: 9,   max: 14,   name: 'Mythisch',     roman: 'V',    color: '#ff5b8a', glow: 0.68, prefix: 'Ur-' },
  { min: 15,  max: 24,   name: 'Kosmisch',     roman: 'VI',   color: '#42f5e0', glow: 0.78, prefix: 'Äon-' },
  { min: 25,  max: 39,   name: 'Göttlich',     roman: 'VII',  color: '#ffffff', glow: 0.86, prefix: 'Omega-' },
  { min: 40,  max: 64,   name: 'Titanisch',    roman: 'VIII', color: '#ffa03a', glow: 0.91, prefix: 'Titan-' },
  { min: 65,  max: 104,  name: 'Urzeitlich',   roman: 'IX',   color: '#a6ff4d', glow: 0.95, prefix: 'Nova-' },
  { min: 105, max: 174,  name: 'Ewig',         roman: 'X',    color: '#ff4de3', glow: 0.98, prefix: 'Ewig-' },
  { min: 175, max: 9999, name: 'Singularität', roman: 'XI',   color: '#e8e2ff', glow: 1.00, prefix: 'Null-' }
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
  AR: ['Runen', 'Äther', 'Zeit', 'Chaos', 'Sigil', 'Omega'],
  IS: ['Frost', 'Gletscher', 'Rime', 'Eis', 'Polar', 'Starre'],
  GI: ['Seuchen', 'Mias', 'Venom', 'Fäulnis', 'Spore', 'Toxin'],
  ZE: ['Chronos', 'Sanduhr', 'Stunden', 'Äon', 'Takt', 'Uhrwerk'],
  VO: ['Leeren', 'Abgrund', 'Nihil', 'Schlund', 'Un', 'Hohl'],
  KR: ['Prismen', 'Kristall', 'Facetten', 'Splitter', 'Glas', 'Spiegel'],
  SN: ['Stern', 'Supernova', 'Helios', 'Korona', 'Sonnen', 'Quasar']
};

export const CORE = {
  FE: ['nova', 'zorn', 'brand', 'eruption'],
  WA: ['kaskade', 'welle', 'flut', 'strudel'],
  BL: ['puls', 'salve', 'entladung', 'schlag'],
  ER: ['faust', 'wall', 'bruch', 'koloss'],
  WI: ['sturm', 'schneide', 'wirbel', 'böe'],
  LI: ['strahl', 'glanz', 'halo', 'krone'],
  SC: ['schlund', 'klaue', 'riss', 'schleier'],
  AR: ['siegel', 'formel', 'kreis', 'echo'],
  IS: ['starre', 'schauer', 'lanze', 'grab'],
  GI: ['schwaden', 'biss', 'blüte', 'fäule'],
  ZE: ['schleife', 'takt', 'stunde', 'sprung'],
  VO: ['schlund', 'leere', 'riss', 'stille'],
  KR: ['facette', 'prisma', 'scherbe', 'glanz'],
  SN: ['nova', 'korona', 'brand', 'krone']
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

/* Wellen-Mathematik ------------------------------------------------- *
   Alle Regler an einem Ort. Die Zahlen sind mit einem Simulator geeicht
   (siehe README): Welle 10 nach gut 10 Minuten, Welle 20 nach etwa einer
   Stunde, danach immer gemächlicher — so bleibt jede Welle ein Ziel und
   nicht bloß eine Zwischenstation. */
export const BAL = {
  hpBase: 26, hpExp: 1.90, hpGrowth: 1.045,
  countBase: 4, countPer: 0.85, countMax: 26,
  dmgBase: 6, dmgMul: 2.4, dmgExp: 1.30,
  killBase: 2, killMul: 0.9, killExp: 1.05,
  bonusBase: 20, bonusMul: 8, bonusExp: 1.15,
  /* Jede weitere Rune desselben Elements kostet mehr — das ist die Bremse,
     die verhindert, dass man die Schwierigkeitskurve einfach überkauft. */
  craftDiv: 5, craftExp: 2.2,
  /* Wie stark eine Fähigkeit mit ihrer Runenzahl wächst. */
  powExp: 1.22, variety: 0.11
};

export const isBossWave = (w) => w % 5 === 0;

export function enemyHp(wave) {
  return Math.round(BAL.hpBase * Math.pow(wave, BAL.hpExp) * Math.pow(BAL.hpGrowth, wave) + 12);
}
export function enemyDamage(wave) {
  return Math.round(BAL.dmgBase + BAL.dmgMul * Math.pow(wave, BAL.dmgExp));
}
export function enemyCount(wave) {
  return Math.min(BAL.countMax, BAL.countBase + Math.floor(wave * BAL.countPer));
}
export function essencePerKill(wave) {
  return BAL.killBase + BAL.killMul * Math.pow(wave, BAL.killExp);
}
export function waveBonus(wave) {
  return Math.round(BAL.bonusBase + BAL.bonusMul * Math.pow(wave, BAL.bonusExp));
}
/* Kosten der n-ten Rune eines Elements (n = wie viele man davon schon
   geschmiedet hat). */
export function craftCost(code, made) {
  const base = ELEMENTS[code].craft;
  return Math.ceil(base * Math.pow(1 + made / BAL.craftDiv, BAL.craftExp));
}

/* Was `n` Runen am Stück kosten, wenn man schon `from` davon hat.
   Geschlossene Form statt Schleife — bei tiefen Fusionen geht es um
   Tausende von Runen, und der Preis steht in jeder Kodexkarte. */
export function runeBlockCost(code, from, n) {
  if (n <= 0) return 0;
  const base = ELEMENTS[code].craft, D = BAL.craftDiv, E = BAL.craftExp;
  const F = (x) => Math.pow(1 + x / D, E + 1);
  return base * D / (E + 1) * (F(from + n) - F(from));
}

/* ------------------------------------------------------------------ *
 * DARSTELLUNGSQUALITÄT
 * Ältere Android-Geräte kommen mit voller Auflösung und allen Effekten
 * nicht mit. Die Stufen greifen sofort, ohne Neustart.
 * ------------------------------------------------------------------ */
export const QUALITY = {
  hoch: {
    name: 'Hoch', desc: 'Alle Effekte, volle Auflösung.',
    dpr: 2, particles: 240, stars: true, rings: 26, numbers: 24,
    shake: 1, trail: 12, glow: true, blur: true, shine: true, burstMul: 1
  },
  mittel: {
    name: 'Mittel', desc: 'Weniger Partikel, etwas gröber — spürbar flüssiger.',
    dpr: 1.5, particles: 110, stars: true, rings: 12, numbers: 12,
    shake: 0.7, trail: 8, glow: true, blur: false, shine: false, burstMul: 0.5
  },
  sparsam: {
    name: 'Sparsam', desc: 'Nur das Nötigste. Für ältere Geräte.',
    dpr: 1, particles: 36, stars: false, rings: 4, numbers: 6,
    shake: 0, trail: 0, glow: false, blur: false, shine: false, burstMul: 0.2
  }
};
export const QUALITY_ORDER = ['hoch', 'mittel', 'sparsam'];
/* Bosse sollen eine Wand sein, an der man einmal aufrüstet — keine Mauer.
   Früh mild, später deutlich fordernder. */
export const bossHpMult = (wave) => 9 + wave * 0.18;

/* ------------------------------------------------------------------ *
 * DER HÄNDLER
 * Kommt regelmäßig vorbei, bleibt kurz, hat wenig dabei. Wer gerade kein
 * Geld hat, sieht ihn ziehen — das ist Absicht.
 * ------------------------------------------------------------------ */
export const MERCHANT = {
  everySeconds: 300,      /* alle fünf Minuten Spielzeit */
  staySeconds: 150,       /* zweieinhalb Minuten bleibt er */
  offers: 3,
  firstAtWave: 3          /* vorher hätte man nichts davon */
};

/* Welche Güteklasse hat er dabei? Die guten Sachen erst später. */
export function merchantTierCap(bestWave) {
  if (bestWave >= 22) return 3;
  if (bestWave >= 12) return 2;
  return 1;
}

/* Die Auslage ergibt sich aus dem Startwert — dadurch bleibt sie stabil,
   solange er da ist, auch über einen Neustart der App hinweg. */
export function merchantOffers(seed, bestWave) {
  let a = (seed >>> 0) || 1;
  const rnd = () => {
    a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
  const cap = merchantTierCap(bestWave);
  const pool = SPECIAL_CODES.filter(c => SPECIALS[c].tier <= cap);
  const want = Math.min(MERCHANT.offers, pool.length);
  const out = [];
  while (out.length < want) {
    const code = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push({ code, stock: 1 + Math.floor(rnd() * 2), price: specialPrice(code, bestWave) });
  }
  return out;
}

export function specialPrice(code, bestWave) {
  const t = SPECIALS[code] ? SPECIALS[code].tier : 1;
  const w = Math.max(1, bestWave);
  return Math.round((180 + 260 * t) * (1 + Math.pow(w, 1.65) / 9));
}

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
  { id: 'k5000', name: 'Fünftausend',        desc: '5000 Gegner besiegt',         test: s => s.kills >= 5000,     reward: 12000 },
  { id: 'sp1',   name: 'Erster Handel',      desc: 'Eine Fremdrune vom Händler',  test: s => s.specials >= 1,     reward: 500 },
  { id: 'sp6',   name: 'Stammkunde',         desc: 'Sechs Fremdrunen erstanden',  test: s => s.specials >= 6,     reward: 6000 },
  { id: 'spAll', name: 'Alle Fremden',       desc: 'Alle sechs Arten entdeckt',   test: s => s.specialKinds >= 6, reward: 30000 }
];

/* ------------------------------------------------------------------ *
 * HINTERGRUND / OFFLINE
 * ------------------------------------------------------------------ */
export const MAX_OFFLINE_SECONDS = 8 * 3600;   /* länger bringt nichts mehr */
export const TRAVEL_SECONDS = 14;              /* wie lange ein Gegner bis zum Kern braucht */
