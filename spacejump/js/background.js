// Animierter Hintergrund: Farbverlauf, Nebel, drei Sternenschichten, Planeten,
// Sternschnuppen und Staubstreifen. Alles parallax zur Kamera.

import { TAU, rand, randInt, mulberry32, hsl, mixHsl, clamp, makeCanvas } from './util.js';
import { sectorDef, sectorIndex, sectorProgress } from './sectors.js';

function planetSprite(r, palA, palB, ring, seed) {
  const rnd = mulberry32(seed);
  const pad = ring ? r * 1.5 : r * 0.35;
  const size = (r + pad) * 2;
  const { canvas, ctx } = makeCanvas(size, size, 1);
  const cx = size / 2, cy = size / 2;

  if (ring) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.strokeStyle = hsl(palB[0], palB[1], palB[2] + 12, 0.5);
    ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.55, r * 0.42, 0, Math.PI, TAU); ctx.stroke();
    ctx.restore();
  }

  // Atmosphäre
  const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
  glow.addColorStop(0, hsl(palA[0], palA[1], palA[2] + 18, 0.35));
  glow.addColorStop(1, hsl(palA[0], palA[1], palA[2], 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, TAU); ctx.fill();

  // Kugel
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, hsl(palA[0], palA[1], palA[2] + 14));
  g.addColorStop(0.6, hsl(palA[0], palA[1], palA[2]));
  g.addColorStop(1, hsl(palB[0], palB[1], Math.max(6, palB[2] - 18)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();

  // Oberflächenbänder / Krater
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const bands = randInt(2, 4);
  for (let i = 0; i < bands; i++) {
    const y = cy - r + rnd() * r * 2;
    ctx.fillStyle = hsl(palB[0], palB[1], palB[2] + (rnd() * 14 - 6), 0.35);
    ctx.beginPath();
    ctx.ellipse(cx + (rnd() - 0.5) * r * 0.4, y, r * (0.7 + rnd() * 0.5), r * (0.06 + rnd() * 0.12), 0, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU, d = rnd() * r * 0.8;
    const cr = r * (0.05 + rnd() * 0.12);
    ctx.fillStyle = hsl(palB[0], palB[1] * 0.8, palB[2] - 10, 0.4);
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr, 0, TAU); ctx.fill();
  }
  // Nachtseite
  const sh = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  sh.addColorStop(1, 'rgba(0,0,10,0.62)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  if (ring) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.strokeStyle = hsl(palB[0], palB[1], palB[2] + 20, 0.75);
    ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.55, r * 0.42, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = hsl(palA[0], palA[1], palA[2] + 25, 0.4);
    ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.78, r * 0.5, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  return { canvas, size };
}

export class Sky {
  constructor() {
    this.W = 480; this.H = 800;
    this.stars = [];
    this.planets = [];
    this.nebulae = [];
    this.shooting = [];
    this.dust = [];
    this.t = 0;
    this.nextPlanet = 0;
    this.nextNebula = 0;
    this.top = [230, 60, 14];
    this.bottom = [246, 58, 6];
    this.nebA = [205, 85, 55];
    this.nebB = [262, 75, 48];
    this.starTint = [200, 40, 92];
    this.quality = 1;
  }

  reset(camY) {
    this.planets.length = 0;
    this.nebulae.length = 0;
    this.shooting.length = 0;
    this.dust.length = 0;
    this.nextPlanet = camY - 200;
    this.nextNebula = camY - 100;
    this.t = 0;
  }

  resize(W, H) {
    this.W = W; this.H = H;
    this.stars.length = 0;
    const layers = [
      { f: 0.04, n: Math.round((W * H) / 3600), r: [0.5, 1.2], a: [0.3, 0.7] },
      { f: 0.11, n: Math.round((W * H) / 6400), r: [0.8, 1.8], a: [0.45, 0.9] },
      { f: 0.22, n: Math.round((W * H) / 16000), r: [1.2, 2.8], a: [0.65, 1.0] },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        this.stars.push({
          x: rand(W), y: rand(H),
          r: rand(L.r[0], L.r[1]),
          a: rand(L.a[0], L.a[1]),
          f: L.f,
          tw: rand(TAU),
          ts: rand(0.6, 2.4),
          big: L.f > 0.15 && Math.random() < 0.12,
        });
      }
    }
  }

  update(dt, camY, meters, playerVy) {
    this.t += dt;
    const idx = sectorIndex(meters);
    const prog = sectorProgress(meters);
    const cur = sectorDef(idx);
    const next = sectorDef(idx + 1);
    const blend = prog > 0.78 ? (prog - 0.78) / 0.22 : 0;
    this.top = mixHsl(cur.sky[0], next.sky[0], blend);
    this.bottom = mixHsl(cur.sky[1], next.sky[1], blend);
    this.nebA = mixHsl(cur.neb[0], next.neb[0], blend);
    this.nebB = mixHsl(cur.neb[1], next.neb[1], blend);
    this.starTint = mixHsl(cur.star, next.star, blend);
    this.curSector = cur;

    // Planeten nachschieben
    while (camY < this.nextPlanet) {
      const r = rand(34, 120) * (0.8 + this.quality * 0.4);
      const ring = cur.ring && Math.random() < 0.5;
      const seed = randInt(1, 1e6);
      const sprite = planetSprite(r, cur.planet[0], cur.planet[1], ring, seed);
      this.planets.push({
        x: rand(-r * 0.3, this.W + r * 0.3),
        y: this.nextPlanet * 0.25 - r - 60,
        par: 0.25, r, sprite,
        spin: rand(-0.05, 0.05),
        rot: rand(TAU),
      });
      this.nextPlanet -= rand(900, 2200);
    }
    for (let i = this.planets.length - 1; i >= 0; i--) {
      const p = this.planets[i];
      p.rot += p.spin * dt;
      if (p.y - camY * p.par > this.H + p.r * 2 + 80) this.planets.splice(i, 1);
    }

    // Nebelschwaden
    while (camY < this.nextNebula) {
      this.nebulae.push({
        x: rand(-60, this.W + 60),
        y: this.nextNebula * 0.12 - rand(60, 240),
        par: 0.12,
        r: rand(130, 340),
        which: Math.random() < 0.5 ? 0 : 1,
        a: rand(0.18, 0.42),
        drift: rand(-6, 6),
      });
      this.nextNebula -= rand(280, 620);
    }
    for (let i = this.nebulae.length - 1; i >= 0; i--) {
      const n = this.nebulae[i];
      n.x += n.drift * dt;
      if (n.y - camY * n.par > this.H + n.r + 100) this.nebulae.splice(i, 1);
    }

    // Sternschnuppen
    if (Math.random() < dt * 0.35) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.shooting.push({
        x: dir > 0 ? rand(-40, this.W * 0.5) : rand(this.W * 0.5, this.W + 40),
        y: rand(-20, this.H * 0.6),
        vx: dir * rand(280, 520),
        vy: rand(120, 260),
        life: 0, max: rand(0.6, 1.1),
        len: rand(28, 70),
      });
    }
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const s = this.shooting[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt;
      if (s.life > s.max) this.shooting.splice(i, 1);
    }

    // Staubstreifen bei hohem Tempo
    const speed = Math.abs(playerVy || 0);
    if (speed > 500 && this.quality > 0.4) {
      const n = Math.min(4, Math.round(dt * speed * 0.06));
      for (let i = 0; i < n; i++) {
        this.dust.push({ x: rand(this.W), y: rand(-40, this.H + 40), len: rand(18, 60), life: 0, max: rand(0.2, 0.45) });
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.life += dt;
      if (d.life > d.max) this.dust.splice(i, 1);
    }
  }

  draw(ctx, camY, playerVy) {
    const { W, H } = this;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hsl(this.top[0], this.top[1], this.top[2]));
    g.addColorStop(0.55, hsl(
      (this.top[0] + this.bottom[0]) / 2, (this.top[1] + this.bottom[1]) / 2,
      (this.top[2] + this.bottom[2]) / 2 - 1));
    g.addColorStop(1, hsl(this.bottom[0], this.bottom[1], this.bottom[2]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Nebel
    for (const n of this.nebulae) {
      const y = n.y - camY * n.par;
      if (y < -n.r - 60 || y > H + n.r + 60) continue;
      const c = n.which ? this.nebB : this.nebA;
      const rg = ctx.createRadialGradient(n.x, y, n.r * 0.05, n.x, y, n.r);
      rg.addColorStop(0, hsl(c[0], c[1], c[2], n.a));
      rg.addColorStop(0.5, hsl(c[0], c[1], c[2] * 0.8, n.a * 0.45));
      rg.addColorStop(1, hsl(c[0], c[1], c[2], 0));
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(n.x, y, n.r, 0, TAU); ctx.fill();
    }

    // Sterne
    const band = H;
    const tint = this.starTint;
    for (const s of this.stars) {
      let y = (s.y - camY * s.f) % band;
      if (y < 0) y += band;
      const tw = 0.72 + Math.sin(this.t * s.ts + s.tw) * 0.28;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = hsl(tint[0], tint[1], tint[2]);
      if (s.big) {
        const r = s.r * 1.6 * tw;
        ctx.beginPath(); ctx.arc(s.x, y, s.r * 0.9, 0, TAU); ctx.fill();
        ctx.globalAlpha = s.a * tw * 0.5;
        ctx.fillRect(s.x - r * 2.4, y - 0.35, r * 4.8, 0.7);
        ctx.fillRect(s.x - 0.35, y - r * 2.4, 0.7, r * 4.8);
      } else {
        ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Planeten
    for (const p of this.planets) {
      const y = p.y - camY * p.par;
      if (y < -p.sprite.size || y > H + p.sprite.size) continue;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.rotate(p.rot * 0.15);
      ctx.drawImage(p.sprite.canvas, -p.sprite.size / 2, -p.sprite.size / 2, p.sprite.size, p.sprite.size);
      ctx.restore();
    }

    // Sternschnuppen
    for (const s of this.shooting) {
      const k = s.life / s.max;
      const a = Math.sin(k * Math.PI);
      const nx = s.vx, ny = s.vy;
      const l = Math.hypot(nx, ny) || 1;
      const lg = ctx.createLinearGradient(s.x, s.y, s.x - (nx / l) * s.len, s.y - (ny / l) * s.len);
      lg.addColorStop(0, `rgba(255,255,255,${0.85 * a})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - (nx / l) * s.len, s.y - (ny / l) * s.len);
      ctx.stroke();
    }

    // Tempo-Staub
    if (this.dust.length) {
      const up = (playerVy || 0) < 0 ? 1 : -1;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      for (const d of this.dust) {
        const a = Math.sin((1 - d.life / d.max) * Math.PI * 0.5);
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.len * up);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Dunkler Rand — hält den Blick in der Mitte. */
  drawVignette(ctx) {
    const { W, H } = this;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,8,${clamp(0.34, 0, 1)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}
