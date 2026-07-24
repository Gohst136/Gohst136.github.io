/* Siegel: das Bild einer Fähigkeit.

   Drei Ebenen bestimmen, was man sieht:
     · das ELEMENT gibt das Motiv (Flamme, Tropfen, Blitz …) und die Farben,
     · die ID gibt die Linienführung — jede Fähigkeit ihr eigenes Zeichen,
     · die STUFE gibt Rahmen, Zierrat, Strahlen und Aura.

   Dadurch bleibt eine Fähigkeit über alle Verschmelzungen hinweg erkennbar
   und wird trotzdem mit jeder Stufe sichtbar prächtiger. Alles wird als
   Data-URL zwischengespeichert, damit lange Listen flüssig scrollen. */

import { rng, TAU, withAlpha, lighten, darken, clamp } from './util.js';
import { ELEMENTS } from './data.js';

const cache = new Map();
const TIER_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

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
  if (cache.size > 500) cache.clear();
  cache.set(key, url);
  return url;
}

/* ------------------------------------------------------------------ *
 * Formhelfer
 * ------------------------------------------------------------------ */

function poly(ctx, cx, cy, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * TAU;
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function spikes(ctx, cx, cy, rIn, rOut, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const ang = rot + (i / (n * 2)) * TAU;
    const r = i % 2 ? rIn : rOut;
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function dot(ctx, x, y, r, fill, glow) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  if (glow) { ctx.shadowBlur = r * 3; ctx.shadowColor = glow; }
  ctx.fill();
  ctx.shadowBlur = 0;
}

/* ------------------------------------------------------------------ *
 * Elementmotive — je Element ein eigenes Wahrzeichen
 * Alle zeichnen in ein Feld von -1..1 um den Ursprung.
 * ------------------------------------------------------------------ */

/* Zusätzliche Schnittkanten, die nur gezeichnet (nicht gefüllt) werden. */
const MOTIF_LINES = {
  ER(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -1);    ctx.lineTo(-0.3, 0.9);
    ctx.moveTo(0, -1);    ctx.lineTo(0.3, 0.9);
    ctx.moveTo(-0.72, -0.24); ctx.lineTo(0.72, -0.24);
  },
  WA(ctx) {
    ctx.beginPath();
    ctx.arc(-0.3, 0.34, 0.26, Math.PI * 0.7, Math.PI * 1.5);
  },
  AR(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.1); ctx.lineTo(0.5, -0.1);
    ctx.moveTo(0, -0.58);   ctx.lineTo(0, 0.3);
  }
};

const MOTIF = {
  FE(ctx) {                                  /* Flamme */
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.62, -0.32, 0.78, 0.24, 0.36, 0.72);
    ctx.bezierCurveTo(0.16, 0.94, -0.2, 0.96, -0.42, 0.7);
    ctx.bezierCurveTo(-0.78, 0.26, -0.5, -0.3, -0.12, -0.52);
    ctx.bezierCurveTo(-0.2, -0.16, 0.02, -0.02, 0.16, -0.18);
    ctx.bezierCurveTo(0.3, -0.4, 0.16, -0.72, 0, -1);
    ctx.closePath();
  },
  WA(ctx) {                                  /* Tropfen */
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.55, -0.3, 0.85, 0.12, 0.85, 0.34);
    ctx.arc(0, 0.34, 0.85, 0, Math.PI);
    ctx.bezierCurveTo(-0.85, 0.12, -0.55, -0.3, 0, -1);
    ctx.closePath();
  },
  BL(ctx) {                                  /* Blitz */
    ctx.beginPath();
    ctx.moveTo(0.24, -1);
    ctx.lineTo(-0.62, 0.1);
    ctx.lineTo(-0.06, 0.1);
    ctx.lineTo(-0.28, 1);
    ctx.lineTo(0.66, -0.16);
    ctx.lineTo(0.06, -0.16);
    ctx.closePath();
  },
  ER(ctx) {                                  /* Kristall */
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0.72, -0.24);
    ctx.lineTo(0.46, 0.9);
    ctx.lineTo(-0.46, 0.9);
    ctx.lineTo(-0.72, -0.24);
    ctx.closePath();
  },
  WI(ctx) {                                  /* Schwinge */
    ctx.beginPath();
    ctx.moveTo(-0.95, 0.18);
    ctx.bezierCurveTo(-0.3, -0.62, 0.42, -0.72, 0.95, -0.24);
    ctx.bezierCurveTo(0.42, -0.18, 0.06, 0.06, -0.16, 0.44);
    ctx.bezierCurveTo(-0.34, 0.16, -0.62, 0.14, -0.95, 0.18);
    ctx.closePath();
    ctx.moveTo(-0.62, 0.72);
    ctx.bezierCurveTo(-0.16, 0.36, 0.34, 0.3, 0.72, 0.44);
    ctx.bezierCurveTo(0.3, 0.56, 0.02, 0.74, -0.14, 1);
    ctx.bezierCurveTo(-0.26, 0.8, -0.44, 0.74, -0.62, 0.72);
    ctx.closePath();
  },
  LI(ctx) {                                  /* Sonne */
    ctx.beginPath();
    ctx.arc(0, 0, 0.42, 0, TAU);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU;
      const w = 0.13;
      ctx.moveTo(Math.cos(a0 - w) * 0.56, Math.sin(a0 - w) * 0.56);
      ctx.lineTo(Math.cos(a0) * 1.0, Math.sin(a0) * 1.0);
      ctx.lineTo(Math.cos(a0 + w) * 0.56, Math.sin(a0 + w) * 0.56);
      ctx.closePath();
    }
  },
  SC(ctx) {                                  /* Mondsichel: Kreis minus Kreis */
    ctx.beginPath();
    ctx.arc(-0.08, 0, 0.94, 0, TAU);
    ctx.arc(0.34, -0.06, 0.80, 0, TAU, true);
  },
  AR(ctx) {                                  /* Runenkreis */
    ctx.beginPath();
    ctx.arc(0, 0, 0.94, 0, TAU);
    ctx.arc(0, 0, 0.72, 0, TAU, true);
    ctx.closePath();
    ctx.moveTo(0, -0.58);
    ctx.lineTo(0.5, 0.3);
    ctx.lineTo(-0.5, 0.3);
    ctx.closePath();
  }
};

/* ------------------------------------------------------------------ *
 * Hauptzeichnung
 * ------------------------------------------------------------------ */

export function drawGlyph(ctx, size, a) {
  const S = size, c = S / 2;
  const r = rng(a.seed);
  const { a: cA, b: cB, glow } = a.colors;
  const T = TIER_ORDER.indexOf(a.tier.roman);        /* 0 … 6 */
  const tierColor = a.tier.color;

  ctx.save();
  ctx.clearRect(0, 0, S, S);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  /* ---------- 1. Aura ---------- */
  if (T >= 1) {
    const aura = ctx.createRadialGradient(c, c, S * 0.18, c, c, S * 0.5);
    aura.addColorStop(0, withAlpha(glow, 0.05 + T * 0.055));
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, S, S);
  }

  /* ---------- 2. Strahlenkranz ---------- */
  if (T >= 4) {
    const rays = 12 + (T - 4) * 6;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(r() * TAU);
    for (let i = 0; i < rays; i++) {
      ctx.rotate(TAU / rays);
      const len = S * (0.47 + (i % 2 ? 0.03 : 0));
      const g = ctx.createLinearGradient(0, -S * 0.3, 0, -len);
      g.addColorStop(0, withAlpha(tierColor, 0.34));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(0.8, S * 0.012);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.3);
      ctx.lineTo(0, -len);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 3. Außenring ---------- */
  if (T >= 2) {
    ctx.beginPath();
    ctx.arc(c, c, S * 0.455, 0, TAU);
    ctx.strokeStyle = withAlpha(tierColor, 0.30 + T * 0.05);
    ctx.lineWidth = Math.max(1, S * 0.011);
    ctx.stroke();
  }
  if (T >= 5) {
    ctx.setLineDash([S * 0.03, S * 0.045]);
    ctx.beginPath();
    ctx.arc(c, c, S * 0.485, 0, TAU);
    ctx.strokeStyle = withAlpha(tierColor, 0.6);
    ctx.lineWidth = Math.max(1, S * 0.014);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- 4. Rahmenzacken ---------- */
  const sides = T <= 2 ? 6 : T <= 4 ? 8 : 12;
  const rFrame = S * 0.40;
  if (T >= 3) {
    const n = T <= 4 ? 4 : T === 5 ? 6 : 8;
    spikes(ctx, c, c, rFrame * 0.98, S * (T >= 6 ? 0.475 : 0.45), n,
           -Math.PI / 2 + (T >= 6 ? 0 : Math.PI / n));
    const g = ctx.createLinearGradient(0, c - rFrame, 0, c + rFrame);
    g.addColorStop(0, withAlpha(lighten(tierColor, 0.4), 0.95));
    g.addColorStop(1, withAlpha(darken(tierColor, 0.35), 0.9));
    ctx.fillStyle = g;
    ctx.fill();
  }

  /* ---------- 5. Rahmen ---------- */
  poly(ctx, c, c, rFrame, sides);
  const frameGrad = ctx.createLinearGradient(0, c - rFrame, 0, c + rFrame);
  frameGrad.addColorStop(0, lighten(tierColor, T >= 3 ? 0.55 : 0.25));
  frameGrad.addColorStop(0.5, tierColor);
  frameGrad.addColorStop(1, darken(tierColor, 0.5));
  ctx.fillStyle = frameGrad;
  ctx.fill();

  /* ---------- 6. Platte ---------- */
  const rPlate = rFrame * (T >= 3 ? 0.845 : 0.88);
  poly(ctx, c, c, rPlate, sides);
  const plate = ctx.createRadialGradient(c, c * 0.82, S * 0.02, c, c, rPlate * 1.2);
  plate.addColorStop(0, darken(cA, 0.28));
  plate.addColorStop(0.55, darken(cB, 0.55));
  plate.addColorStop(1, darken(cB, 0.78));
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.save();
  ctx.clip();

  /* Facetten — lässt die Platte wie geschliffen wirken. */
  for (let i = 0; i < 3; i++) {
    const ang = r() * TAU;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(ang) * S, c + Math.sin(ang) * S);
    ctx.lineTo(c + Math.cos(ang + 0.5) * S, c + Math.sin(ang + 0.5) * S);
    ctx.lineTo(c, c);
    ctx.closePath();
    ctx.fillStyle = withAlpha('#ffffff', 0.045);
    ctx.fill();
  }

  /* ---------- 7. Linienwerk: die Handschrift dieser einen ID ---------- *
     Bleibt bewusst dezent — es ist Textur hinter dem Motiv, kein Hauptdarsteller. */
  const rows = clamp(2 + Math.floor(a.level / 3), 2, 6);
  const nodes = [];
  for (let i = 0; i < rows; i++) {
    const y = 0.24 + (i / Math.max(1, rows - 1)) * 0.52;
    const x = 0.5 + 0.09 + r() * 0.22;
    nodes.push({ x, y });
  }
  const P = (p) => [p.x * S, p.y * S];
  const M = (p) => [(1 - p.x) * S, p.y * S];

  const tracery = (mirror, width, color) => {
    const f = mirror ? M : P;
    ctx.beginPath();
    ctx.moveTo(c, S * 0.17);
    for (const n of nodes) ctx.lineTo(...f(n));
    ctx.lineTo(c, S * 0.83);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  /* Hintergrundform: gibt jeder ID eine eigene Silhouette hinter dem Motiv. */
  const bgSides = 3 + Math.floor(r() * 6);
  poly(ctx, c, c, rPlate * 0.72, bgSides, r() * TAU);
  ctx.fillStyle = withAlpha(lighten(cA, 0.6), 0.10);
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, S * 0.008);
  ctx.strokeStyle = withAlpha(lighten(cA, 0.8), 0.22);
  ctx.stroke();

  const lw = Math.max(1, S * 0.016);
  tracery(false, lw, withAlpha(lighten(cA, 0.75), 0.5));
  tracery(true,  lw, withAlpha(lighten(cA, 0.75), 0.5));

  const bars = clamp(1 + Math.floor(a.level / 5), 1, 4);
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = withAlpha(lighten(cA, 0.8), 0.30);
  for (let i = 0; i < bars && i < nodes.length; i++) {
    const n = nodes[Math.floor(r() * nodes.length)];
    ctx.beginPath();
    ctx.moveTo(...P(n));
    ctx.lineTo(...M(n));
    ctx.stroke();
  }
  for (const n of nodes) {
    for (const f of [P, M]) {
      const [x, y] = f(n);
      dot(ctx, x, y, lw * 0.72, withAlpha(lighten(cA, 0.85), 0.75), null);
    }
  }

  /* ---------- 8. Elementmotiv — das Wahrzeichen ---------- */
  const motif = MOTIF[a.dom];
  if (motif) {
    const scale = S * (0.30 + Math.min(0.04, a.level * 0.004));
    ctx.save();
    ctx.translate(c, c + S * 0.01);
    ctx.scale(scale, scale);
    motif(ctx);
    ctx.restore();

    /* dunkler Absatz, damit das Zeichen von der Platte abhebt */
    ctx.lineWidth = Math.max(1.6, S * 0.028);
    ctx.strokeStyle = withAlpha('#000000', 0.45);
    ctx.stroke();

    const mg = ctx.createLinearGradient(0, c - S * 0.3, 0, c + S * 0.3);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(0.55, lighten(cA, 0.55));
    mg.addColorStop(1, lighten(cB, 0.2));
    ctx.fillStyle = mg;
    ctx.shadowBlur = S * (0.09 + T * 0.016);
    ctx.shadowColor = withAlpha(glow, 0.95);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(0.7, S * 0.007);
    ctx.strokeStyle = withAlpha('#ffffff', 0.75);
    ctx.stroke();

    const lines = MOTIF_LINES[a.dom];
    if (lines) {
      ctx.save();
      ctx.translate(c, c + S * 0.01);
      ctx.scale(scale, scale);
      lines(ctx);
      ctx.restore();
      ctx.lineWidth = Math.max(0.7, S * 0.009);
      ctx.strokeStyle = withAlpha(darken(cB, 0.4), 0.55);
      ctx.stroke();
    }
  }

  /* Lichtkante oben */
  const shine = ctx.createLinearGradient(0, c - rPlate, 0, c + S * 0.05);
  shine.addColorStop(0, withAlpha('#ffffff', 0.22));
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  /* ---------- 9. Elementsteine ---------- */
  const gems = a.codes.slice(0, 6);
  if (gems.length > 1) {
    gems.forEach((code, i) => {
      const ang = -Math.PI / 2 + ((i + 0.5) / gems.length) * TAU;
      const rr = rFrame * 0.99;
      const x = c + Math.cos(ang) * rr, y = c + Math.sin(ang) * rr;
      const el = ELEMENTS[code];
      const g = ctx.createLinearGradient(x - S * 0.02, y - S * 0.02, x + S * 0.02, y + S * 0.02);
      g.addColorStop(0, lighten(el.colors[0], 0.3));
      g.addColorStop(1, el.colors[1]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      const s = S * 0.036;
      ctx.fillStyle = g;
      ctx.shadowBlur = S * 0.05;
      ctx.shadowColor = withAlpha(el.colors[0], 0.9);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha('#ffffff', 0.65);
      ctx.lineWidth = Math.max(0.6, S * 0.006);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    });
  }

  /* ---------- 10. Krone der höchsten Stufen ---------- */
  if (T >= 6) {
    ctx.save();
    ctx.translate(c, c - rFrame * 1.06);
    ctx.beginPath();
    ctx.moveTo(-S * 0.09, 0);
    ctx.lineTo(-S * 0.05, -S * 0.055);
    ctx.lineTo(0, -S * 0.015);
    ctx.lineTo(S * 0.05, -S * 0.055);
    ctx.lineTo(S * 0.09, 0);
    ctx.closePath();
    ctx.fillStyle = lighten(tierColor, 0.3);
    ctx.shadowBlur = S * 0.08;
    ctx.shadowColor = withAlpha(tierColor, 1);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

export function clearGlyphCache() { cache.clear(); }
