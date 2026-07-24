/* Kleine Helfer: Hash, deterministischer Zufall, Farben, Formatierung, Speicher. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp  = (a, b, t) => a + (b - a) * t;
export const TAU   = Math.PI * 2;

/* FNV-1a — stabil über Sitzungen hinweg, damit eine Fähigkeits-ID immer
   dieselben Werte, Farben und dasselbe Siegel erzeugt. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* Deterministischer PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

/* Zahlen kurz und lesbar: 12.4K, 3.1M … */
export function fmt(n) {
  n = Math.round(n);
  if (Math.abs(n) < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let u = -1, v = n;
  while (Math.abs(v) >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + units[u];
}

/* Farben ------------------------------------------------------------ */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgbToHex = ({ r, g, b }) =>
  '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex({ r: lerp(A.r, B.r, t), g: lerp(A.g, B.g, t), b: lerp(A.b, B.b, t) });
}
export function mixMany(pairs) { /* [[hex, weight], …] */
  let r = 0, g = 0, b = 0, w = 0;
  for (const [hex, weight] of pairs) {
    const c = hexToRgb(hex);
    r += c.r * weight; g += c.g * weight; b += c.b * weight; w += weight;
  }
  return w ? rgbToHex({ r: r / w, g: g / w, b: b / w }) : '#888888';
}
export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function lighten(hex, t) { return mixHex(hex, '#ffffff', t); }
export function darken(hex, t)  { return mixHex(hex, '#000000', t); }

/* Haptik / Feedback -------------------------------------------------- */
export function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}

/* Speicher ----------------------------------------------------------- */
const KEY = 'aetherforge.save.v1';
export function saveState(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
  catch (_) { return false; }
}
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
export function clearState() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

/* Kurz-ID für Inventar-Einträge (mehrere Kopien derselben Fähigkeit). */
let uidCounter = 0;
export function uid() {
  uidCounter = (uidCounter + 1) % 1e6;
  return Date.now().toString(36) + '-' + uidCounter.toString(36);
}
