// Die Figur: Physik, Zustände (Schild, Rucksack, Magnet), Animation.

import { TAU, clamp, lerp, rand } from './util.js';
import { drawSkin, drawFlame } from './skins.js';

export const PHYS = {
  gravity: 1500,
  jump: -700,
  boost: -1480,
  magnetLaunch: -1120,
  stomp: -820,
  accel: 2100,
  maxVx: 400,
  groundDrag: 0.86,
  airDrag: 0.94,
  jetVel: -640,
  jetTime: 2.4,
  maxFall: 1250,
};

export class Player {
  constructor(skin) {
    this.setSkin(skin);
    this.w = 30;
    this.h = 44;
    this.reset(0, 0);
  }

  setSkin(skin) {
    this.skin = skin;
    this.perk = skin.perk || {};
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = PHYS.jump;
    this.t = 0;
    this.limb = 0;
    this.lean = 0;
    this.squash = 1;
    this.jet = 0;
    this.jetT = 0;
    this.shield = 0;
    this.magnet = 0;
    this.slow = 0;
    this.dead = false;
    this.deadT = 0;
    this.rot = 0;
    this.trail = [];
    this.stuck = null;      // Magnetschleuder hält gerade fest
    this.stuckT = 0;
    this.invuln = 0;
    this.blink = 0;
    this.nextBlink = rand(1.5, 4);
    this.warp = 0;
  }

  get cx() { return this.x; }
  get cy() { return this.y; }

  /** Fußlinie für die Plattform-Kollision. */
  feet() {
    return { x: this.x - this.w * 0.34, w: this.w * 0.68, y: this.y + this.h * 0.42 };
  }

  jump(power = 1, sfxHook = null) {
    const mul = this.perk.jump || 1;
    this.vy = PHYS.jump * power * mul;
    this.squash = 0.72;
    if (sfxHook) sfxHook();
  }

  launch(vy) {
    this.vy = vy * (this.perk.jump || 1);
    this.squash = 0.6;
  }

  giveJet() {
    this.jetT = PHYS.jetTime;
    this.invuln = Math.max(this.invuln, PHYS.jetTime);
  }

  hurt() {
    if (this.invuln > 0) return 'none';
    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 1.4;
      return 'shield';
    }
    this.dead = true;
    this.deadT = 0;
    this.vy = -320;
    this.jetT = 0;
    return 'dead';
  }

  update(dt, input, W) {
    this.t += dt;

    // Blinzeln
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = Math.min(1, this.blink + dt * 12);
      if (this.blink >= 1) { this.nextBlink = rand(1.8, 5); this.blinkOut = true; }
    }
    if (this.blinkOut) {
      this.blink = Math.max(0, this.blink - dt * 10);
      if (this.blink <= 0) this.blinkOut = false;
    }

    if (this.dead) {
      this.deadT += dt;
      this.vy = Math.min(this.vy + PHYS.gravity * 0.8 * dt, PHYS.maxFall);
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.rot += dt * 6;
      return;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.magnet > 0) this.magnet -= dt;
    if (this.slow > 0) this.slow -= dt;

    // Magnetschleuder hält fest
    if (this.stuck) {
      this.stuckT -= dt;
      this.x = this.stuck.x + this.stuck.w / 2;
      this.y = this.stuck.y - this.h * 0.42;
      this.vy = 0; this.vx = 0;
      this.squash = lerp(this.squash, 0.7, dt * 8);
      if (this.stuckT <= 0) {
        this.launch(PHYS.magnetLaunch);
        this.stuck.charge = 1;
        this.stuck = null;
      }
      this.limb += dt * 2;
      return;
    }

    // Seitwärts
    const drift = this.perk.drift || 1;
    const acc = PHYS.accel / drift;
    if (input.dir !== 0) {
      this.vx += input.dir * acc * dt;
    } else {
      const d = Math.pow(this.jetT > 0 ? 0.02 : 0.06, dt * (1 / drift));
      this.vx *= d;
    }
    if (input.targetX !== null && input.targetX !== undefined) {
      // Ziehsteuerung: Figur folgt dem Finger
      const dx = input.targetX - this.x;
      this.vx = clamp(dx * 9, -PHYS.maxVx * 1.3, PHYS.maxVx * 1.3);
    }
    this.vx = clamp(this.vx, -PHYS.maxVx, PHYS.maxVx);

    // Rucksack
    if (this.jetT > 0) {
      this.jetT -= dt;
      this.vy = lerp(this.vy, PHYS.jetVel, 1 - Math.pow(0.001, dt));
      this.jet = Math.min(1, this.jet + dt * 6);
    } else {
      this.jet = Math.max(0, this.jet - dt * 4);
      this.vy += PHYS.gravity * dt;
    }
    this.vy = Math.min(this.vy, PHYS.maxFall);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bildschirmkante: rechts raus, links rein
    if (this.x < -this.w * 0.5) this.x = W + this.w * 0.5;
    if (this.x > W + this.w * 0.5) this.x = -this.w * 0.5;

    // Animation
    const target = clamp(-this.vy / 1400, -0.18, 0.26);
    this.squash = lerp(this.squash, 1 + target, 1 - Math.pow(0.0008, dt));
    this.lean = lerp(this.lean, clamp(this.vx / PHYS.maxVx, -1, 1), 1 - Math.pow(0.002, dt));
    this.limb += dt * (4 + Math.abs(this.vx) * 0.02);
    this.rot = lerp(this.rot, this.lean * 0.16, 1 - Math.pow(0.005, dt));
    if (this.warp > 0) this.warp = Math.max(0, this.warp - dt * 3);

    // Nachzieher
    if (Math.abs(this.vy) > 520 || this.jetT > 0) {
      this.trail.push({ x: this.x, y: this.y, a: 1 });
      if (this.trail.length > 12) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].a -= dt * 3.4;
      if (this.trail[i].a <= 0) this.trail.splice(i, 1);
    }
  }

  draw(ctx, camY, showTrail = true) {
    const sy = this.dead ? 1 : this.squash;
    const sx = this.dead ? 1 : 1 / Math.max(0.4, sy);

    if (showTrail) {
      for (const p of this.trail) {
        const k = p.a * p.a;
        ctx.save();
        ctx.globalAlpha = k * 0.2;
        ctx.translate(p.x, p.y - camY);
        ctx.fillStyle = this.skin.pal.glow;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.w * 0.16 * (0.4 + k), this.h * 0.2 * (0.4 + k), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(this.x, this.y - camY);
    ctx.rotate(this.dead ? this.rot : this.rot);
    ctx.scale(sx, sy);

    if (this.invuln > 0 && this.shield <= 0 && this.jetT <= 0) {
      ctx.globalAlpha = 0.45 + Math.sin(this.t * 30) * 0.35;
    }

    drawSkin(ctx, this.skin, {
      t: this.t,
      lean: this.lean,
      limb: this.limb,
      jet: this.jet,
      blink: this.blink,
      grounded: false,
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // Rucksackflamme zusätzlich außerhalb der Skalierung, damit sie nicht staucht
    if (this.jet > 0.05) {
      ctx.save();
      ctx.translate(this.x, this.y - camY + this.h * 0.35);
      drawFlame(ctx, 0, 0, this.jet * 34, 16, this.t + 1.7, '#ffffff', '#ff9a1a');
      ctx.restore();
    }

    // Schildblase
    if (this.shield > 0) {
      const pulse = 0.65 + Math.sin(this.t * 4) * 0.2;
      ctx.save();
      ctx.translate(this.x, this.y - camY);
      const g = ctx.createRadialGradient(0, 0, 12, 0, 0, 30);
      g.addColorStop(0, 'rgba(120,220,255,0.05)');
      g.addColorStop(0.75, `rgba(120,220,255,${0.18 * pulse})`);
      g.addColorStop(1, `rgba(200,245,255,${0.5 * pulse})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(200,245,255,${0.7 * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // Magnetfeld
    if (this.magnet > 0) {
      ctx.save();
      ctx.translate(this.x, this.y - camY);
      ctx.strokeStyle = 'rgba(201,157,255,0.5)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const k = ((this.t * 1.2 + i / 3) % 1);
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.beginPath(); ctx.arc(0, 0, 22 + k * 70, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}
