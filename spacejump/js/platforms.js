// Neun Plattformarten. Jede hat eigenes Verhalten, eigene Farben, eigene Animation.

import { TAU, rand, randInt, clamp, roundRect, lerp } from './util.js';

export const PLAT_H = 15;

export const TYPES = {
  normal: { label: 'Stahlplattform', hint: 'Hält, was sie verspricht.', c1: '#8fa3bd', c2: '#3c4a63', edge: '#cfe0f5', glow: '#7fe3ff' },
  moving: { label: 'Driftplattform', hint: 'Fliegt seitlich weiter.', c1: '#7fc2ff', c2: '#22456e', edge: '#d3ecff', glow: '#4fd4ff' },
  ice: { label: 'Eisplatte', hint: 'Zerbricht beim Aufsetzen.', c1: '#bfeeff', c2: '#3f7f9c', edge: '#ffffff', glow: '#9ff3ff' },
  boost: { label: 'Schubdüse', hint: 'Schleudert dich weit nach oben.', c1: '#ffb03a', c2: '#8a3410', edge: '#ffe6b0', glow: '#ff7a1a' },
  phase: { label: 'Phasenplattform', hint: 'Nur fest, solange sie da ist.', c1: '#c79bff', c2: '#4a2a80', edge: '#f0e0ff', glow: '#b96bff' },
  magnet: { label: 'Magnetschleuder', hint: 'Hält dich fest und katapultiert dich.', c1: '#9fffd0', c2: '#1c6b50', edge: '#e0fff0', glow: '#3dffb0' },
  plasma: { label: 'Plasmaplattform', hint: 'Fass sie nicht an.', c1: '#ff6b6b', c2: '#701020', edge: '#ffd0d0', glow: '#ff2d55' },
  portal: { label: 'Portalplattform', hint: 'Setzt dich woanders wieder ab.', c1: '#7ff0ff', c2: '#134a5c', edge: '#dbfaff', glow: '#33e0ff' },
  orbit: { label: 'Orbitplattform', hint: 'Kreist um einen Ankerpunkt.', c1: '#ffd76b', c2: '#6b4a10', edge: '#fff2c9', glow: '#ffc93d' },
};

let uid = 1;

export function makePlatform(type, x, y, w, W) {
  const p = {
    id: uid++,
    type, x, y, w, h: PLAT_H,
    vx: 0, vy: 0,
    t: rand(TAU),
    hits: 0,
    dead: false,
    rot: 0, rotV: 0,
    fade: 1,
    fireT: 0,
    charge: 0,
    used: false,
  };
  switch (type) {
    case 'moving':
      p.vx = rand(38, 82) * (Math.random() < 0.5 ? -1 : 1);
      break;
    case 'phase':
      p.period = rand(2.0, 3.2);
      p.offset = rand(0, p.period);
      break;
    case 'plasma':
      // Plasmaplattformen wandern manchmal — dann sind sie richtig fies.
      if (Math.random() < 0.35) p.vx = rand(26, 55) * (Math.random() < 0.5 ? -1 : 1);
      break;
    case 'portal':
      p.link = rand(60, W - 60);
      break;
    case 'orbit':
      p.cx = clamp(x + w / 2, 90, W - 90);
      p.cy = y;
      p.rad = rand(46, 78);
      p.ang = rand(TAU);
      p.spd = rand(0.7, 1.5) * (Math.random() < 0.5 ? -1 : 1);
      break;
    default:
      break;
  }
  return p;
}

/** Ist die Plattform gerade fest? (Phasenplattformen blinken.) */
export function isSolid(p, phaseAlwaysSolid = false) {
  if (p.dead) return false;
  if (p.type === 'phase') {
    if (phaseAlwaysSolid) return true;
    return phaseValue(p) > 0.5;
  }
  return true;
}

function phaseValue(p) {
  const k = ((p.t + p.offset) % p.period) / p.period;
  // 60 % der Zeit fest, weiche Flanken
  return k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.12) * (k < 0.72 ? 1 : 0) + (k > 0.88 ? (k - 0.88) / 0.12 : 0);
}

export function updatePlatform(p, dt, W) {
  p.t += dt;
  if (p.dead) {
    p.vy += 900 * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt;
    p.rot += p.rotV * dt;
    p.fade = Math.max(0, p.fade - dt * 1.4);
    return;
  }
  if (p.fireT > 0) p.fireT = Math.max(0, p.fireT - dt);
  if (p.charge > 0) p.charge = Math.max(0, p.charge - dt * 1.6);

  if (p.type === 'orbit') {
    p.ang += p.spd * dt;
    p.x = p.cx + Math.cos(p.ang) * p.rad - p.w / 2;
    p.y = p.cy + Math.sin(p.ang) * p.rad * 0.36;
    return;
  }
  if (p.vx) {
    p.x += p.vx * dt;
    if (p.x < 4) { p.x = 4; p.vx = Math.abs(p.vx); }
    if (p.x + p.w > W - 4) { p.x = W - 4 - p.w; p.vx = -Math.abs(p.vx); }
  }
}

export function breakPlatform(p) {
  p.dead = true;
  p.vy = -40;
  p.vx = rand(-40, 40);
  p.rotV = rand(-3, 3);
}

// ------------------------------------------------------------------ Zeichnen

function plate(ctx, p, c1, c2, edge, r = 6) {
  const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, r);
  ctx.fill();
  ctx.fillStyle = edge;
  ctx.globalAlpha = 0.75;
  roundRect(ctx, -p.w / 2 + 2, -p.h / 2 + 1.5, p.w - 4, 2.5, 1.2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function underGlow(ctx, p, color, strength = 1) {
  const g = ctx.createLinearGradient(0, p.h / 2 - 2, 0, p.h / 2 + 16 * strength);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5 * strength;
  ctx.fillStyle = g;
  ctx.fillRect(-p.w / 2, p.h / 2 - 2, p.w, 18 * strength);
  ctx.globalAlpha = 1;
}

export function drawPlatform(ctx, p, opts = {}) {
  const T = TYPES[p.type] || TYPES.normal;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2 - opts.camY);
  if (p.dead) {
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.fade;
  }

  switch (p.type) {
    case 'normal': {
      underGlow(ctx, p, 'rgba(120,200,255,0.35)', 0.6);
      plate(ctx, p, T.c1, T.c2, T.edge);
      ctx.fillStyle = 'rgba(10,16,28,0.55)';
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath(); ctx.arc(i * (p.w / 2 - 8), 1, 2, 0, TAU); ctx.fill();
      }
      const blink = 0.45 + Math.sin(p.t * 3 + p.id) * 0.35;
      ctx.fillStyle = T.glow;
      ctx.globalAlpha = blink;
      ctx.fillRect(-p.w / 2 + 6, p.h / 2 - 3.5, p.w - 12, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'moving': {
      const dir = Math.sign(p.vx) || 1;
      underGlow(ctx, p, 'rgba(80,200,255,0.4)', 0.7);
      plate(ctx, p, T.c1, T.c2, T.edge);
      // Düsen an den Enden
      ctx.fillStyle = '#1b2b40';
      roundRect(ctx, -p.w / 2 - 6, -4, 7, 8, 2); ctx.fill();
      roundRect(ctx, p.w / 2 - 1, -4, 7, 8, 2); ctx.fill();
      const fl = 6 + Math.sin(p.t * 22) * 2.5;
      const fx = dir > 0 ? -p.w / 2 - 6 : p.w / 2 + 6;
      const g = ctx.createLinearGradient(fx, 0, fx - dir * fl, 0);
      g.addColorStop(0, '#bff0ff');
      g.addColorStop(1, 'rgba(60,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx, -3.2); ctx.lineTo(fx - dir * fl, 0); ctx.lineTo(fx, 3.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.glow;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-p.w / 2 + 6, p.h / 2 - 3.5, p.w - 12, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'ice': {
      const cracked = p.hits > 0;
      ctx.globalAlpha = (p.dead ? p.fade : 1) * 0.95;
      const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, 'rgba(230,250,255,0.95)');
      g.addColorStop(0.5, 'rgba(150,225,255,0.75)');
      g.addColorStop(1, 'rgba(60,140,180,0.75)');
      ctx.fillStyle = g;
      ctx.beginPath();
      const w2 = p.w / 2, h2 = p.h / 2;
      ctx.moveTo(-w2 + 4, -h2);
      ctx.lineTo(w2 - 6, -h2 + 1);
      ctx.lineTo(w2, h2 - 3);
      ctx.lineTo(-w2 + 8, h2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Facetten
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-w2 * 0.4, -h2); ctx.lineTo(-w2 * 0.1, h2);
      ctx.moveTo(w2 * 0.3, -h2); ctx.lineTo(w2 * 0.5, h2);
      ctx.stroke();
      if (cracked) {
        ctx.strokeStyle = 'rgba(30,70,100,0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-w2 * 0.6, h2); ctx.lineTo(-w2 * 0.2, -1); ctx.lineTo(w2 * 0.1, h2 * 0.4);
        ctx.lineTo(w2 * 0.45, -h2 * 0.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'boost': {
      const fire = p.fireT > 0 ? p.fireT / 0.5 : 0;
      underGlow(ctx, p, 'rgba(255,140,40,0.5)', 0.8 + fire);
      plate(ctx, p, T.c1, T.c2, T.edge, 4);
      // Warnstreifen
      ctx.save();
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 4); ctx.clip();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#2a1005';
      for (let i = -p.w; i < p.w; i += 12) {
        ctx.beginPath();
        ctx.moveTo(i, -p.h / 2); ctx.lineTo(i + 6, -p.h / 2);
        ctx.lineTo(i + 6 - p.h, p.h / 2); ctx.lineTo(i - p.h, p.h / 2);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // Düsenkegel
      ctx.fillStyle = '#3a1608';
      ctx.beginPath();
      ctx.moveTo(-11, p.h / 2 - 1); ctx.lineTo(11, p.h / 2 - 1);
      ctx.lineTo(7, p.h / 2 + 7); ctx.lineTo(-7, p.h / 2 + 7);
      ctx.closePath(); ctx.fill();
      const fl = 10 + fire * 40 + Math.sin(p.t * 30) * 3;
      const fg = ctx.createLinearGradient(0, p.h / 2, 0, p.h / 2 + fl);
      fg.addColorStop(0, '#fff3c4');
      fg.addColorStop(0.35, '#ff9a1a');
      fg.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-7, p.h / 2 + 5);
      ctx.quadraticCurveTo(-4, p.h / 2 + fl * 0.7, 0, p.h / 2 + fl);
      ctx.quadraticCurveTo(4, p.h / 2 + fl * 0.7, 7, p.h / 2 + 5);
      ctx.closePath(); ctx.fill();
      if (fire > 0) {
        ctx.strokeStyle = `rgba(255,200,120,${fire * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w * 0.6 + (1 - fire) * 60, p.h * 0.7 + (1 - fire) * 26, 0, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'phase': {
      const v = opts.phaseSolid ? 1 : phaseValue(p);
      const a = 0.18 + v * 0.82;
      ctx.globalAlpha = (p.dead ? p.fade : 1) * a;
      underGlow(ctx, p, 'rgba(180,110,255,0.5)', v);
      const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, `rgba(199,155,255,${0.35 + v * 0.6})`);
      g.addColorStop(1, `rgba(74,42,128,${0.3 + v * 0.6})`);
      ctx.fillStyle = g;
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.fill();
      ctx.strokeStyle = T.edge; ctx.lineWidth = 1.3;
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.stroke();
      // Rasterlinien
      ctx.strokeStyle = `rgba(240,224,255,${0.25 + v * 0.35})`;
      ctx.lineWidth = 0.8;
      for (let i = -p.w / 2 + 6; i < p.w / 2; i += 9) {
        ctx.beginPath(); ctx.moveTo(i, -p.h / 2 + 2); ctx.lineTo(i - 4, p.h / 2 - 2); ctx.stroke();
      }
      const scan = ((p.t * 40) % (p.h + 8)) - p.h / 2 - 4;
      ctx.fillStyle = `rgba(255,255,255,${0.25 * v})`;
      ctx.fillRect(-p.w / 2, scan, p.w, 1.6);
      ctx.globalAlpha = 1;
      break;
    }
    case 'magnet': {
      const c = p.charge;
      underGlow(ctx, p, 'rgba(60,255,176,0.45)', 0.6 + c);
      plate(ctx, p, T.c1, T.c2, T.edge, 3);
      // Spulen
      ctx.fillStyle = '#0e3628';
      for (const s of [-1, 1]) {
        roundRect(ctx, s * (p.w / 2 - 9) - 5, -p.h / 2 - 9, 10, 12, 3); ctx.fill();
        ctx.fillStyle = T.glow;
        ctx.globalAlpha = 0.55 + Math.sin(p.t * 6 + s) * 0.25 + c * 0.4;
        ctx.beginPath(); ctx.arc(s * (p.w / 2 - 9), -p.h / 2 - 4, 3.2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0e3628';
      }
      // Lichtbogen
      const steps = 8;
      ctx.strokeStyle = `rgba(160,255,220,${0.4 + c * 0.6})`;
      ctx.lineWidth = 1 + c * 2;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = lerp(-(p.w / 2 - 9), p.w / 2 - 9, i / steps);
        const y = -p.h / 2 - 4 - Math.sin((i / steps) * Math.PI) * (5 + c * 6) + rand(-1.2, 1.2) * (0.4 + c);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'plasma': {
      underGlow(ctx, p, 'rgba(255,45,85,0.45)', 0.8);
      plate(ctx, p, '#4a1020', '#1c060c', '#ff8fa0', 4);
      // Plasmaband
      const y0 = -p.h / 2 - 3;
      const grd = ctx.createLinearGradient(0, y0 - 4, 0, y0 + 4);
      grd.addColorStop(0, 'rgba(255,80,120,0)');
      grd.addColorStop(0.5, '#ff2d55');
      grd.addColorStop(1, 'rgba(255,80,120,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(-p.w / 2 + 3, y0 - 4, p.w - 6, 8);
      ctx.strokeStyle = '#ffd0d8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const x = lerp(-p.w / 2 + 4, p.w / 2 - 4, i / n);
        const y = y0 + Math.sin(p.t * 9 + i * 1.3) * 2.4 + rand(-1, 1);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      // Emitter
      ctx.fillStyle = '#2a0a12';
      for (const s of [-1, 1]) { roundRect(ctx, s * (p.w / 2 - 6) - 4, y0 - 5, 8, 10, 2); ctx.fill(); }
      break;
    }
    case 'portal': {
      underGlow(ctx, p, 'rgba(51,224,255,0.45)', 0.7);
      plate(ctx, p, T.c1, T.c2, T.edge, 7);
      // Wirbel
      ctx.save();
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.clip();
      for (let i = 0; i < 3; i++) {
        const k = (p.t * 0.8 + i / 3) % 1;
        ctx.strokeStyle = `rgba(220,250,255,${0.7 * (1 - k)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, (p.w / 2) * k, (p.h / 2) * k, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#eaffff';
      ctx.globalAlpha = 0.6 + Math.sin(p.t * 5) * 0.3;
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'orbit': {
      // Anker + Bahn
      ctx.save();
      ctx.translate(-(p.x + p.w / 2 - p.cx), -(p.y + p.h / 2 - p.cy));
      ctx.strokeStyle = 'rgba(255,215,107,0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.ellipse(0, 0, p.rad, p.rad * 0.36, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd76b';
      ctx.globalAlpha = 0.5 + Math.sin(p.t * 3) * 0.25;
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      underGlow(ctx, p, 'rgba(255,201,61,0.4)', 0.6);
      plate(ctx, p, T.c1, T.c2, T.edge, 5);
      ctx.strokeStyle = 'rgba(255,242,201,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * 0.36, p.h * 0.9, 0.4, 0, TAU); ctx.stroke();
      break;
    }
    default:
      plate(ctx, p, T.c1, T.c2, T.edge);
  }

  ctx.restore();
}

/** Zufällige Breite je nach Art. */
export function widthFor(type, difficulty) {
  const shrink = clamp(1 - difficulty * 0.18, 0.72, 1);
  switch (type) {
    case 'boost': return 56 * shrink;
    case 'magnet': return 64 * shrink;
    case 'portal': return 58 * shrink;
    case 'orbit': return 56 * shrink;
    case 'plasma': return randInt(58, 92) * shrink;
    case 'ice': return randInt(62, 84) * shrink;
    case 'moving': return randInt(56, 76) * shrink;
    case 'phase': return randInt(62, 82) * shrink;
    default: return randInt(64, 96) * shrink;
  }
}

export const platformColor = (type) => (TYPES[type] || TYPES.normal).glow;
