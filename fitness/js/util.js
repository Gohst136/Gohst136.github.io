// Kleine Helfer, die überall gebraucht werden.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Zahl mit deutschem Tausenderpunkt, ohne Nachkommastellen. */
export function num(v) {
  return Math.round(v || 0).toLocaleString('de-DE');
}

/** Eine Nachkommastelle, aber nur wenn nötig. */
export function dec(v, digits = 1) {
  const n = Number(v) || 0;
  const r = n.toFixed(digits);
  return r.replace(/\.0+$/, '').replace('.', ',');
}

export const todayKey = () => dateKey(new Date());

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, delta) {
  const d = parseKey(key);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const weekday = (key) => WEEKDAYS[parseKey(key).getDay()];

export function prettyDate(key) {
  if (key === todayKey()) return 'Heute';
  if (key === addDays(todayKey(), -1)) return 'Gestern';
  if (key === addDays(todayKey(), 1)) return 'Morgen';
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function longDate(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** Die letzten n Tage inkl. key, ältester zuerst. */
export function lastDays(key, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(key, -i));
  return out;
}

/** Kurzer Vibrations-Impuls, wo das Gerät mitspielt. */
export function tap(pattern = 8) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* egal */ }
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Umlaute raus, alles klein — damit "muesli" auch "Müsli" findet. */
export function norm(s) {
  return String(s).toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const sum = (arr, pick) => arr.reduce((a, x) => a + (pick ? pick(x) : x), 0);
