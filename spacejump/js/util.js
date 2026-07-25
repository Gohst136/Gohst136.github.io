// Kleine Helfer, die überall gebraucht werden.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** Bewegt `cur` höchstens um `step` Richtung `target`. */
export function approach(cur, target, step) {
  if (cur < target) return Math.min(cur + step, target);
  return Math.max(cur - step, target);
}

export function rand(a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function choice(list) {
  return list[(Math.random() * list.length) | 0];
}

/** Gewichtete Auswahl aus [[wert, gewicht], ...]. Gewichte <= 0 fallen raus. */
export function weighted(entries) {
  let total = 0;
  for (const e of entries) if (e[1] > 0) total += e[1];
  if (total <= 0) return entries[0][0];
  let r = Math.random() * total;
  for (const e of entries) {
    if (e[1] <= 0) continue;
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

/** Deterministischer Zufall — gleiche Saat, gleiche Folge. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

export const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;

/** Mischt zwei [h,s,l]-Tripel; der Farbton nimmt den kürzeren Weg über den Kreis. */
export function mixHsl(a, b, t) {
  let dh = ((b[0] - a[0] + 540) % 360) - 180;
  return [
    (a[0] + dh * t + 360) % 360,
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

const NUM = new Intl.NumberFormat('de-DE');
export const fmt = (n) => NUM.format(Math.round(n));

/** Rundes Rechteck als Pfad (Safari kann roundRect erst seit 16). */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Sternpolygon als Pfad. */
export function starPath(ctx, x, y, spikes, outer, inner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / spikes - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** Offscreen-Canvas in Geräteauflösung; gibt {canvas, ctx, w, h} zurück. */
export function makeCanvas(w, h, dpr = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx, w, h };
}
