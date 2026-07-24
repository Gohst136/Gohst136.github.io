/* Das Herz des Spiels: aus einer Element-Signatur wird eine vollständige,
   immer gleich aussehende Fähigkeit abgeleitet.

   Eine Fähigkeit ist nichts als ein Multiset von Basisrunen:
       { FE: 2, BL: 1 }  ->  ID "BL1.FE2"
   Alles andere (Name, Farben, Werte, Siegel) wird deterministisch aus dieser
   ID berechnet. Dadurch ist eine Entdeckung dauerhaft: dieselbe Verschmelzung
   liefert morgen exakt dieselbe Fähigkeit. */

import {
  ELEMENTS, ELEMENT_CODES, NAMED, PREFIX, CORE, tierOf
} from './data.js';
import { hash32, rng, mixMany, lighten, clamp } from './util.js';

export const MAX_LEVEL = 64;

/* ---------- ID <-> Signatur ---------------------------------------- */

export function signatureId(counts) {
  return Object.keys(counts)
    .filter(k => counts[k] > 0)
    .sort()
    .map(k => k + counts[k])
    .join('.');
}

export function parseId(id) {
  const counts = {};
  for (const part of id.split('.')) {
    const m = /^([A-Z]{2})(\d+)$/.exec(part);
    if (!m || !ELEMENTS[m[1]]) continue;
    counts[m[1]] = (counts[m[1]] || 0) + parseInt(m[2], 10);
  }
  return counts;
}

export function mergeCounts(a, b) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = (out[k] || 0) + a[k];
  for (const k of Object.keys(b)) out[k] = (out[k] || 0) + b[k];
  return out;
}

export const baseId = (code) => code + '1';

/* Ergebnis-ID einer Verschmelzung, ohne die Fähigkeit zu bauen. */
export function fusionId(idA, idB) {
  return signatureId(mergeCounts(parseId(idA), parseId(idB)));
}

export function levelOfId(id) {
  const c = parseId(id);
  return Object.values(c).reduce((s, n) => s + n, 0);
}

/* ---------- Namen --------------------------------------------------- */

function buildName(id, counts, dom, sec, level, tier) {
  if (NAMED[id]) return NAMED[id];
  const r = rng(hash32('name:' + id));
  const pre   = PREFIX[dom][Math.floor(r() * PREFIX[dom].length)];
  const pool  = CORE[sec];
  let ci = Math.floor(r() * pool.length);
  /* "Sturmsturm" vermeiden: dann einfach den nächsten Kern nehmen. */
  if (pool[ci].toLowerCase() === pre.toLowerCase()) ci = (ci + 1) % pool.length;
  const core = pool[ci];

  let name = pre + core;
  /* Doppelbuchstaben an der Fuge lesbar halten: "Glutt…" -> "Glut-t…" */
  if (pre[pre.length - 1].toLowerCase() === core[0].toLowerCase()) {
    name = pre + '-' + core;
  }
  /* Ab drei Runen die Tiefe mit anhängen. Die Wortpaare wiederholen sich
     zwangsläufig irgendwann — so bleibt jeder Kodexeintrag unterscheidbar,
     und man sieht sofort, welche Fassung die stärkere ist. */
  const depth = level >= 3 ? '·' + level : '';
  return tier.prefix + name + depth;
}

/* ---------- Bauplan einer Fähigkeit --------------------------------- */

const _cache = new Map();

export function ability(id) {
  if (_cache.has(id)) return _cache.get(id);

  const counts = parseId(id);
  const codes  = Object.keys(counts).sort(
    (a, b) => (counts[b] - counts[a]) || (ELEMENTS[a].order - ELEMENTS[b].order)
  );
  if (!codes.length) throw new Error('Ungültige Fähigkeits-ID: ' + id);

  const level    = codes.reduce((s, c) => s + counts[c], 0);
  const distinct = codes.length;
  const dom      = codes[0];
  const sec      = codes[1] || codes[0];
  const tier     = tierOf(level);
  const share    = {};
  for (const c of codes) share[c] = counts[c] / level;
  const sh = (c) => share[c] || 0;

  const r    = rng(hash32('stats:' + id));
  const roll = 0.94 + r() * 0.14;               /* ±7 %, fest pro Fähigkeit */

  /* Gewichtete Elementmodifikatoren */
  let mDmg = 0, mCd = 0, mCrit = 0, mAoe = 0, mCount = 0;
  for (const c of codes) {
    const m = ELEMENTS[c].mod, s = share[c];
    mDmg += m.dmg * s; mCd += m.cd * s; mCrit += m.crit * s;
    mAoe += m.aoe * s; mCount += m.count * s;
  }

  /* Vielfalt zahlt sich aus — verschiedene Elemente > dasselbe achtmal. */
  const variety = 1 + 0.11 * (distinct - 1);

  const dmg   = 9 * Math.pow(level, 1.28) * variety * (1 + mDmg) * roll;
  const cd    = clamp(1250 * (1 + mCd) * (1 - Math.min(0.30, level * 0.011)), 220, 2600);
  const crit  = clamp(0.05 + mCrit + level * 0.006, 0.02, 0.75);
  const count = clamp(1 + Math.round(mCount * (1 + level * 0.16)), 1, 9);
  const aoe   = 24 + 46 * mAoe + level * 1.4;
  const speed = clamp(430 + 180 * sh('BL') + 140 * sh('WI') - 90 * sh('ER'), 240, 900);

  const stats = {
    dmg, cd, crit, count, aoe, speed,
    critMult:   2 + sh('LI') * 1.6,
    burn:       sh('FE') * 0.55,                       /* Anteil als Schaden über Zeit */
    slow:       sh('WA') * 0.50,
    chain:      Math.floor(sh('BL') * 3.2),
    pierce:     Math.floor(sh('WI') * 4.2),
    lifesteal:  sh('SC') * 0.11,
    echo:       sh('AR') * 0.45
  };

  const dps = stats.dmg * stats.count *
              (1 + stats.crit * (stats.critMult - 1)) *
              (1 + stats.echo) / (stats.cd / 1000);
  const power = Math.max(1, Math.round(dps));

  /* Farben: gewichtete Mischung aller beteiligten Elemente. */
  const cA = mixMany(codes.map(c => [ELEMENTS[c].colors[0], counts[c]]));
  const cB = mixMany(codes.map(c => [ELEMENTS[c].colors[1], counts[c]]));
  const glow = lighten(cA, 0.25 + tier.glow * 0.25);

  const effects = codes
    .filter(c => share[c] >= 0.12)
    .map(c => ({
      code: c,
      name: ELEMENTS[c].effectName,
      desc: ELEMENTS[c].effectDesc,
      share: share[c]
    }));

  const a = {
    id, counts, codes, level, distinct, dom, sec, tier, share,
    name: buildName(id, counts, dom, sec, level, tier),
    colors: { a: cA, b: cB, glow },
    shot: ELEMENTS[dom].shot,
    stats, power, effects,
    seed: hash32('glyph:' + id)
  };
  _cache.set(id, a);
  return a;
}

/* ---------- Verschmelzen -------------------------------------------- */

export function canFuse(idA, idB) {
  if (!idA || !idB) return { ok: false, reason: 'Zwei Fähigkeiten auswählen.' };
  const lvl = levelOfId(idA) + levelOfId(idB);
  if (lvl > MAX_LEVEL) {
    return { ok: false, reason: `Ein Kern fasst höchstens ${MAX_LEVEL} Runen.` };
  }
  return { ok: true, id: fusionId(idA, idB) };
}

export function fuse(idA, idB) {
  const check = canFuse(idA, idB);
  if (!check.ok) throw new Error(check.reason);
  return ability(check.id);
}

/* Kosten, um eine bereits entdeckte Fähigkeit erneut zu schmieden. */
export function reforgeCost(id) {
  const lvl = levelOfId(id);
  const rune = Object.entries(parseId(id))
    .reduce((s, [c, n]) => s + ELEMENTS[c].craft * n, 0);
  return Math.round(rune * 1.25 + 4 * Math.pow(lvl, 1.7));
}

/* Kurzer Beschreibungstext für die Detailansicht. */
export function describe(a) {
  const parts = [];
  if (a.stats.count > 1) parts.push(`${a.stats.count} Geschosse`);
  if (a.stats.pierce > 0) parts.push(`durchdringt ${a.stats.pierce}`);
  if (a.stats.chain > 0) parts.push(`springt ${a.stats.chain}×`);
  if (a.stats.burn > 0.05) parts.push(`brennt ${Math.round(a.stats.burn * 100)} %`);
  if (a.stats.slow > 0.05) parts.push(`verlangsamt ${Math.round(a.stats.slow * 100)} %`);
  if (a.stats.lifesteal > 0.01) parts.push(`zehrt ${(a.stats.lifesteal * 100).toFixed(1)} %`);
  if (a.stats.echo > 0.03) parts.push(`Echo ${Math.round(a.stats.echo * 100)} %`);
  return parts.join(' · ') || 'Ein schlichter, ehrlicher Treffer.';
}

/* Zusammensetzung als lesbarer String: "Feuer ×2 · Blitz ×1" */
export function composition(a) {
  return a.codes.map(c => `${ELEMENTS[c].name} ×${a.counts[c]}`).join(' · ');
}

/* Alle Basisrunen als Fähigkeiten. */
export function baseAbilities() {
  return ELEMENT_CODES.map(c => ability(baseId(c)));
}
