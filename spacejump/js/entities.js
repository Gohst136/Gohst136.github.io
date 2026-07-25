// Aufsammelbares, Gegner, Geschosse, Partikel — alles prozedural gezeichnet.

import { TAU, rand, randInt, choice, clamp, roundRect, starPath, mulberry32, lerp } from './util.js';

// ------------------------------------------------------------------ Pickups

export const PICKUPS = {
  coin: { r: 9, label: 'Sternmünze' },
  o2: { r: 12, label: 'O₂-Kanister' },
  jet: { r: 14, label: 'Rucksackdüse' },
  shield: { r: 13, label: 'Schildblase' },
  magnet: { r: 13, label: 'Münzmagnet' },
};

export function makePickup(kind, x, y) {
  return { kind, x, y, r: PICKUPS[kind].r, t: rand(TAU), vx: 0, vy: 0, taken: false, mag: 0 };
}

export function updatePickup(u, dt) {
  u.t += dt;
  if (u.mag > 0) {
    u.x += u.vx * dt;
    u.y += u.vy * dt;
  }
}

export function drawPickup(ctx, u, camY) {
  const y = u.y - camY;
  ctx.save();
  ctx.translate(u.x, y + Math.sin(u.t * 2.4) * 3);
  switch (u.kind) {
    case 'coin': {
      const s = Math.cos(u.t * 3.4);
      const w = Math.max(0.16, Math.abs(s));
      ctx.save();
      ctx.scale(w, 1);
      const g = ctx.createLinearGradient(-9, -9, 9, 9);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffcc33'); g.addColorStop(1, '#c98a10');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      starPath(ctx, 0, 0, 5, 5, 2.2, u.t * 0.8);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.25 + Math.abs(s) * 0.2;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'o2': {
      ctx.rotate(Math.sin(u.t * 1.4) * 0.25);
      ctx.fillStyle = '#0f3d4e';
      roundRect(ctx, -6, -12, 12, 22, 5); ctx.fill();
      const g = ctx.createLinearGradient(-6, 0, 6, 0);
      g.addColorStop(0, '#7ef0ff'); g.addColorStop(0.5, '#2bc7e8'); g.addColorStop(1, '#0d7a95');
      ctx.fillStyle = g;
      roundRect(ctx, -5, -11, 10, 20, 4); ctx.fill();
      ctx.fillStyle = '#e9feff';
      roundRect(ctx, -3, -14, 6, 4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('O₂', 0, 1);
      ctx.globalAlpha = 0.3 + Math.sin(u.t * 4) * 0.15;
      ctx.fillStyle = '#7ef0ff';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'jet': {
      ctx.rotate(Math.sin(u.t * 2) * 0.15);
      ctx.fillStyle = '#7a3410';
      roundRect(ctx, -11, -12, 22, 20, 6); ctx.fill();
      const g = ctx.createLinearGradient(0, -12, 0, 8);
      g.addColorStop(0, '#ffd08a'); g.addColorStop(1, '#e2560f');
      ctx.fillStyle = g;
      roundRect(ctx, -9, -10, 18, 16, 5); ctx.fill();
      ctx.fillStyle = '#2a1206';
      roundRect(ctx, -7, 6, 5, 6, 2); ctx.fill();
      roundRect(ctx, 2, 6, 5, 6, 2); ctx.fill();
      const fl = 6 + Math.sin(u.t * 20) * 2;
      ctx.fillStyle = 'rgba(255,180,60,0.85)';
      ctx.beginPath(); ctx.moveTo(-6.5, 12); ctx.lineTo(-4.5, 12 + fl); ctx.lineTo(-2.5, 12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2.5, 12); ctx.lineTo(4.5, 12 + fl); ctx.lineTo(6.5, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-4, 2); ctx.moveTo(4, -6); ctx.lineTo(4, 2); ctx.stroke();
      break;
    }
    case 'shield': {
      const pulse = 0.7 + Math.sin(u.t * 3.5) * 0.3;
      ctx.strokeStyle = `rgba(120,220,255,${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
      g.addColorStop(0, 'rgba(200,245,255,0.7)');
      g.addColorStop(1, 'rgba(60,160,255,0.18)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + u.t * 0.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
      break;
    }
    case 'magnet': {
      ctx.rotate(Math.sin(u.t * 2.2) * 0.3);
      ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 6; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 1, 7, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = '#e8d0ff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-7, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, 1); ctx.lineTo(7, 7); ctx.stroke();
      ctx.globalAlpha = 0.35 + Math.sin(u.t * 5) * 0.2;
      ctx.fillStyle = '#c99dff';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ------------------------------------------------------------------- Gegner

export function makeDrone(x, y, W, level) {
  return {
    kind: 'drone', x, y, r: 17, t: rand(TAU),
    vx: rand(24, 52) * (Math.random() < 0.5 ? -1 : 1) * (1 + level * 0.06),
    baseY: y, dead: false, hp: 1, W,
    fire: rand(1.5, 3.5),
  };
}

export function makeAsteroid(x, y, W, level) {
  const r = rand(14, 30);
  const rnd = mulberry32(randInt(1, 1e6));
  const pts = [];
  const n = randInt(7, 11);
  for (let i = 0; i < n; i++) pts.push(0.68 + rnd() * 0.42);
  return {
    kind: 'asteroid', x, y, r, pts, t: 0,
    vx: rand(30, 78) * (Math.random() < 0.5 ? -1 : 1) * (1 + level * 0.05),
    vy: rand(-8, 22),
    rot: rand(TAU), rotV: rand(-1.6, 1.6),
    dead: false, hp: r > 22 ? 2 : 1, W,
  };
}

export function makeHole(x, y) {
  return { kind: 'hole', x, y, r: rand(22, 34), pull: rand(150, 230), t: rand(TAU), dead: false };
}

export function makeMine(x, y) {
  return { kind: 'mine', x, y, r: 12, t: rand(TAU), dead: false, armed: 0, blast: 0 };
}

export function updateEnemy(e, dt, W) {
  e.t += dt;
  switch (e.kind) {
    case 'drone':
      e.x += e.vx * dt;
      if (e.x < 24) { e.x = 24; e.vx = Math.abs(e.vx); }
      if (e.x > W - 24) { e.x = W - 24; e.vx = -Math.abs(e.vx); }
      e.y = e.baseY + Math.sin(e.t * 1.8) * 12;
      break;
    case 'asteroid':
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rot += e.rotV * dt;
      if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
      if (e.x > W - e.r) { e.x = W - e.r; e.vx = -Math.abs(e.vx); }
      break;
    case 'mine':
      if (e.armed > 0) {
        e.armed -= dt;
        if (e.armed <= 0) { e.blast = 0.35; e.exploding = true; }
      }
      if (e.blast > 0) e.blast = Math.max(0, e.blast - dt);
      break;
    default:
      break;
  }
}

export function drawEnemy(ctx, e, camY) {
  const y = e.y - camY;
  ctx.save();
  ctx.translate(e.x, y);
  switch (e.kind) {
    case 'drone': {
      const bob = Math.sin(e.t * 3) * 1.5;
      // Schatten unter dem Antrieb
      ctx.fillStyle = 'rgba(255,80,80,0.18)';
      ctx.beginPath(); ctx.ellipse(0, 12, 14, 4, 0, 0, TAU); ctx.fill();
      // Kuppel
      const g = ctx.createLinearGradient(0, -14, 0, 8);
      g.addColorStop(0, '#c8d6e8'); g.addColorStop(1, '#4a5870');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, bob - 3, 11, 9, 0, Math.PI, TAU); ctx.fill();
      // Rumpf
      ctx.fillStyle = '#2b3446';
      ctx.beginPath(); ctx.ellipse(0, bob, 18, 6.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#57657f';
      ctx.beginPath(); ctx.ellipse(0, bob - 1.5, 18, 5, 0, Math.PI, TAU); ctx.fill();
      // Auge
      const look = Math.sin(e.t * 1.2) * 3;
      ctx.fillStyle = '#180608';
      ctx.beginPath(); ctx.arc(0, bob - 5, 5.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(look, bob - 5, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35 + Math.sin(e.t * 7) * 0.2;
      ctx.beginPath(); ctx.arc(look, bob - 5, 6.5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // Signallichter
      for (const s of [-1, 1]) {
        ctx.fillStyle = Math.sin(e.t * 5 + s) > 0 ? '#ffd166' : '#5a4a20';
        ctx.beginPath(); ctx.arc(s * 14, bob + 1, 2, 0, TAU); ctx.fill();
      }
      // Antriebsstrahl
      const fl = 5 + Math.sin(e.t * 16) * 2;
      const fg = ctx.createLinearGradient(0, bob + 5, 0, bob + 5 + fl);
      fg.addColorStop(0, 'rgba(255,120,120,0.8)');
      fg.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(-5, bob + 5, 10, fl);
      break;
    }
    case 'asteroid': {
      ctx.rotate(e.rot);
      const n = e.pts.length;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = e.r * e.pts[i];
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.35, e.r * 0.1, 0, 0, e.r);
      g.addColorStop(0, '#9a8b7c'); g.addColorStop(0.6, '#6a5c50'); g.addColorStop(1, '#332a24');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,10,0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
      // Krater
      ctx.fillStyle = 'rgba(30,22,18,0.45)';
      for (let i = 0; i < 3; i++) {
        const a = (i * 2.4) + e.r;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.r * 0.4, Math.sin(a) * e.r * 0.4, e.r * (0.12 + (i % 3) * 0.05), 0, TAU);
        ctx.fill();
      }
      if (e.hp < 2 && e.r > 22) {
        ctx.strokeStyle = 'rgba(255,120,60,0.7)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.6, -e.r * 0.2); ctx.lineTo(0, e.r * 0.1); ctx.lineTo(e.r * 0.5, -e.r * 0.4);
        ctx.stroke();
      }
      break;
    }
    case 'hole': {
      const r = e.r;
      ctx.save();
      ctx.rotate(e.t * 0.4);
      // Linsen-Schimmer
      const halo = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 3.4);
      halo.addColorStop(0, 'rgba(160,80,255,0.32)');
      halo.addColorStop(0.5, 'rgba(90,40,180,0.12)');
      halo.addColorStop(1, 'rgba(40,0,80,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, r * 3.4, 0, TAU); ctx.fill();
      // Scheibe
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(${200 - i * 40},${90 + i * 30},255,${0.7 - i * 0.18})`;
        ctx.lineWidth = 3 - i * 0.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (1.5 + i * 0.42), r * (0.42 + i * 0.16), i * 0.5 + e.t * 0.3, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      // Ereignishorizont
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,180,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r + 1.5, 0, TAU); ctx.stroke();
      // Eingesogene Funken
      for (let i = 0; i < 6; i++) {
        const k = (e.t * 0.7 + i / 6) % 1;
        const rr = lerp(r * 3.2, r * 1.02, k);
        const a = e.t * 2 + i * 1.7 + k * 6;
        ctx.globalAlpha = 0.8 * (1 - k * 0.6);
        ctx.fillStyle = '#e0b0ff';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.55, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'mine': {
      const arm = e.armed > 0;
      const pulse = arm ? (Math.sin(e.t * 30) > 0 ? 1 : 0.2) : 0.4 + Math.sin(e.t * 2.5) * 0.25;
      ctx.strokeStyle = 'rgba(255,90,60,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3a2a2a';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + e.t * 0.5;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-2.4, -10); ctx.lineTo(2.4, -10); ctx.lineTo(0, -17);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
      g.addColorStop(0, '#6a5f5f'); g.addColorStop(1, '#241c1c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,60,60,${pulse})`;
      ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = pulse * 0.4;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (e.blast > 0) {
        const k = 1 - e.blast / 0.35;
        ctx.strokeStyle = `rgba(255,180,80,${1 - k})`;
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(0, 0, 20 + k * 60, 0, TAU); ctx.stroke();
      }
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Geschosse

export function makeBolt(x, y, vx, vy, hostile = false) {
  return { x, y, vx, vy, life: 0, max: hostile ? 3.5 : 1.6, hostile, dead: false };
}

export function updateBolt(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life += dt;
  if (b.life > b.max) b.dead = true;
}

export function drawBolt(ctx, b, camY) {
  const y = b.y - camY;
  const l = Math.hypot(b.vx, b.vy) || 1;
  const ux = b.vx / l, uy = b.vy / l;
  const len = b.hostile ? 10 : 16;
  const c1 = b.hostile ? 'rgba(255,90,90,1)' : 'rgba(190,255,255,1)';
  const c2 = b.hostile ? 'rgba(255,40,40,0)' : 'rgba(80,220,255,0)';
  const g = ctx.createLinearGradient(b.x, y, b.x - ux * len, y - uy * len);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.strokeStyle = g;
  ctx.lineWidth = b.hostile ? 3 : 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b.x, y);
  ctx.lineTo(b.x - ux * len, y - uy * len);
  ctx.stroke();
  ctx.fillStyle = b.hostile ? '#ffdada' : '#eaffff';
  ctx.beginPath(); ctx.arc(b.x, y, b.hostile ? 2 : 2.4, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- Partikel

export class Particles {
  constructor(limit = 700) {
    this.list = [];
    this.limit = limit;
  }

  clear() { this.list.length = 0; }

  spawn(o) {
    if (this.list.length >= this.limit) this.list.shift();
    this.list.push({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 0.6,
      size: 3, color: '#fff', type: 'spark', rot: 0, rotV: 0, drag: 0, ...o,
    });
  }

  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.dir !== undefined ? opts.dir + rand(-opts.spread || -0.6, opts.spread || 0.6) : rand(TAU);
      const sp = rand(opts.speed ? opts.speed[0] : 40, opts.speed ? opts.speed[1] : 170);
      this.spawn({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: opts.g ?? 260,
        drag: opts.drag ?? 1.4,
        life: 0,
        max: rand(opts.life ? opts.life[0] : 0.3, opts.life ? opts.life[1] : 0.8),
        size: rand(opts.size ? opts.size[0] : 1.6, opts.size ? opts.size[1] : 4),
        color: Array.isArray(opts.color) ? choice(opts.color) : (opts.color || '#fff'),
        type: opts.type || 'spark',
        rot: rand(TAU), rotV: rand(-8, 8),
      });
    }
  }

  ring(x, y, color, r = 10, grow = 130, life = 0.45) {
    this.spawn({ x, y, type: 'ring', color, size: r, vx: grow, life: 0, max: life, g: 0 });
  }

  text(x, y, text, color = '#fff') {
    this.spawn({ x, y, type: 'text', color, text, vy: -46, life: 0, max: 1.0, g: 0, size: 14 });
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) { list.splice(i, 1); continue; }
      if (p.type === 'ring') { p.size += p.vx * dt; continue; }
      p.vy += p.g * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d > 0 ? d : 0;
      p.vy *= d > 0 ? d : 0;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }
  }

  draw(ctx, camY) {
    for (const p of this.list) {
      const k = p.life / p.max;
      const a = 1 - k * k;
      const y = p.y - camY;
      ctx.globalAlpha = clamp(a, 0, 1);
      if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, 4 * (1 - k));
        ctx.beginPath(); ctx.arc(p.x, y, p.size, 0, TAU); ctx.stroke();
      } else if (p.type === 'text') {
        ctx.fillStyle = p.color;
        ctx.font = `700 ${p.size}px "Space Grotesk", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x, y);
      } else if (p.type === 'shard') {
        ctx.save();
        ctx.translate(p.x, y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
        ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, y, p.size * (1 + k * 1.6), 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, y, p.size * (1 - k * 0.55), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
