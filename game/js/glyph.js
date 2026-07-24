/* Prozedurale Siegel: jede Fähigkeits-ID bekommt ein eigenes, symmetrisches
   Runenzeichen. Symmetrie ist der ganze Trick — sie lässt Zufall wie Design
   aussehen. Ergebnisse werden als Data-URL zwischengespeichert, damit lange
   Listen auch auf dem iPhone flüssig scrollen. */

import { rng, TAU, withAlpha, lighten, darken } from './util.js';

const cache = new Map();

export function glyphURL(a, size = 128) {
  const key = a.id + '@' + size;
  let url = cache.get(key);
  if (url) return url;
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  drawGlyph(ctx, size, a);
  url = cv.toDataURL('image/png');
  if (cache.size > 400) cache.clear();
  cache.set(key, url);
  return url;
}

/* Zeichnet das Siegel in ein size×size großes Feld ab (0,0). */
export function drawGlyph(ctx, size, a, opt = {}) {
  const S = size, c = S / 2;
  const r = rng(a.seed);
  const { a: cA, b: cB, glow } = a.colors;
  const t = a.tier;

  ctx.save();
  ctx.clearRect(0, 0, S, S);

  /* --- Hintergrund: Rautenrahmen mit Verlauf ---------------------- */
  const bg = ctx.createRadialGradient(c, c * 0.85, S * 0.05, c, c, S * 0.62);
  bg.addColorStop(0, withAlpha(lighten(cA, 0.35), 0.95));
  bg.addColorStop(0.55, withAlpha(cB, 0.85));
  bg.addColorStop(1, withAlpha(darken(cB, 0.72), 0.98));

  const corners = 6;
  ctx.beginPath();
  for (let i = 0; i < corners; i++) {
    const ang = -Math.PI / 2 + (i / corners) * TAU;
    const rad = S * 0.46;
    const x = c + Math.cos(ang) * rad, y = c + Math.sin(ang) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.lineWidth = Math.max(1.2, S * 0.018);
  ctx.strokeStyle = withAlpha(lighten(glow, 0.35), 0.85);
  ctx.stroke();

  /* --- Innenschein ------------------------------------------------ */
  const inner = ctx.createRadialGradient(c, c, 0, c, c, S * 0.5);
  inner.addColorStop(0, withAlpha(lighten(glow, 0.6), 0.30 + t.glow * 0.25));
  inner.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inner;
  ctx.fill();

  /* --- Das Siegel selbst ------------------------------------------ */
  const nodes = [];
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    if (r() < 0.22 && i > 0 && i < rows - 1) continue;
    const y = 0.22 + (i / (rows - 1)) * 0.56;
    const x = 0.5 + (0.06 + r() * 0.26);
    nodes.push({ x, y });
  }
  if (nodes.length < 2) nodes.push({ x: 0.72, y: 0.5 });

  const P = (p) => [p.x * S, p.y * S];
  const M = (p) => [(1 - p.x) * S, p.y * S];

  const strokeSigil = (mirror, width, color, blur) => {
    const f = mirror ? M : P;
    ctx.beginPath();
    ctx.moveTo(c, S * 0.14);
    for (const n of nodes) ctx.lineTo(...f(n));
    ctx.lineTo(c, S * 0.86);
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.shadowBlur = blur;
    ctx.shadowColor = withAlpha(glow, 0.9);
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  const lw = Math.max(1.4, S * 0.032);
  strokeSigil(false, lw * 1.9, withAlpha('#000000', 0.35), 0);
  strokeSigil(true,  lw * 1.9, withAlpha('#000000', 0.35), 0);
  strokeSigil(false, lw, '#ffffff', S * 0.10);
  strokeSigil(true,  lw, '#ffffff', S * 0.10);

  /* Querstreben — geben dem Zeichen Struktur. */
  const bars = Math.min(nodes.length, 1 + Math.floor(r() * 3));
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = withAlpha('#ffffff', 0.75);
  for (let i = 0; i < bars; i++) {
    const n = nodes[Math.floor(r() * nodes.length)];
    ctx.beginPath();
    ctx.moveTo(...P(n));
    ctx.lineTo(...M(n));
    ctx.stroke();
  }

  /* Knotenpunkte */
  for (const n of nodes) {
    for (const f of [P, M]) {
      const [x, y] = f(n);
      ctx.beginPath();
      ctx.arc(x, y, lw * 0.85, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = S * 0.08;
      ctx.shadowColor = withAlpha(glow, 1);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /* --- Rangringe: je höher die Stufe, desto mehr Zierrat ---------- */
  const tierIndex = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].indexOf(t.roman);
  if (tierIndex >= 2) {
    ctx.beginPath();
    ctx.arc(c, c, S * 0.40, 0, TAU);
    ctx.lineWidth = Math.max(1, S * 0.012);
    ctx.strokeStyle = withAlpha('#ffffff', 0.45);
    ctx.stroke();
  }
  if (tierIndex >= 3) {
    const dots = 6 + tierIndex * 2;
    for (let i = 0; i < dots; i++) {
      const ang = (i / dots) * TAU + tierIndex;
      const x = c + Math.cos(ang) * S * 0.44, y = c + Math.sin(ang) * S * 0.44;
      ctx.beginPath();
      ctx.arc(x, y, S * 0.014, 0, TAU);
      ctx.fillStyle = withAlpha(t.color, 0.95);
      ctx.fill();
    }
  }
  if (tierIndex >= 5) {
    ctx.beginPath();
    ctx.arc(c, c, S * 0.34, 0.4, 0.4 + Math.PI * 1.3);
    ctx.lineWidth = Math.max(1, S * 0.016);
    ctx.strokeStyle = withAlpha(t.color, 0.8);
    ctx.stroke();
  }

  ctx.restore();
}

export function clearGlyphCache() { cache.clear(); }
