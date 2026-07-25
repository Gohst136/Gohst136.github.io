// Der Kern: Welt erzeugen, Physik, Kollisionen, Sauerstoff, Zeichnen.

import { clamp, lerp, rand, randInt, weighted } from './util.js';
import { Sky } from './background.js';
import { Player, PHYS } from './player.js';
import {
  makePlatform, updatePlatform, drawPlatform, breakPlatform, isSolid,
  widthFor, TYPES,
} from './platforms.js';
import {
  makePickup, updatePickup, drawPickup, makeDrone, makeAsteroid, makeHole, makeMine,
  updateEnemy, drawEnemy, makeBolt, updateBolt, drawBolt, Particles,
} from './entities.js';
import { sectorDef, sectorIndex, sectorLoop, PX_PER_M } from './sectors.js';
import { sfx } from './audio.js';

const O2_MAX = 100;

export const DEATH = {
  fall: { title: 'Abgestürzt', text: 'Der Boden fällt hier ziemlich weit.' },
  o2: { title: 'Sauerstoff leer', text: 'Ohne Luft kommt niemand weiter. Bleib in Bewegung.' },
  hit: { title: 'Getroffen', text: 'Der Weltraum verzeiht Berührungen selten.' },
  hole: { title: 'Verschluckt', text: 'Ein Schwerkraftfeld hat dich behalten.' },
};

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.W = 480; this.H = 800;
    this.scale = 1; this.offX = 0; this.offY = 0;
    this.sky = new Sky();
    this.particles = new Particles();
    this.platforms = [];
    this.pickups = [];
    this.enemies = [];
    this.bolts = [];
    this.player = null;
    this.state = 'idle';   // idle | playing | dead
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '255,255,255';
    this.settings = { shake: true, trail: true };
    this.resize();
  }

  // -------------------------------------------------------------- Auflösung
  resize() {
    const host = this.canvas.parentElement;
    const rect = host.getBoundingClientRect();
    const cw = Math.max(1, rect.width);
    const ch = Math.max(1, rect.height);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    this.W = 480;
    this.H = clamp(Math.round((480 * ch) / cw), 640, 1120);
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.scale = Math.min((cw * dpr) / this.W, (ch * dpr) / this.H);
    this.offX = ((cw * dpr) - this.W * this.scale) / 2;
    this.offY = ((ch * dpr) - this.H * this.scale) / 2;
    this.sky.resize(this.W, this.H);
  }

  applyTransform() {
    const s = this.scale;
    let sx = 0, sy = 0;
    if (this.shake > 0 && this.settings.shake) {
      sx = rand(-1, 1) * this.shake;
      sy = rand(-1, 1) * this.shake;
    }
    this.ctx.setTransform(s, 0, 0, s, this.offX + sx * s, this.offY + sy * s);
  }

  // ------------------------------------------------------------------ Start
  start(skin, settings) {
    this.settings = { ...this.settings, ...settings };
    this.player = new Player(skin);
    const W = this.W, H = this.H;
    this.camY = -H * 0.35;
    this.startY = 0;
    this.player.reset(W / 2, -60);
    this.player.vy = PHYS.jump;

    this.platforms.length = 0;
    this.pickups.length = 0;
    this.enemies.length = 0;
    this.bolts.length = 0;
    this.particles.clear();
    this.sky.reset(this.camY);

    // Durchgehender Boden, damit der erste Sprung nicht ins Leere geht
    const base = makePlatform('normal', 0, 0, W, W);
    this.platforms.push(base);
    this.genY = 0;
    this.nextBand = -420;
    this.lastType = 'normal';
    this.lastX = W / 2;
    this.easyRows = 5;   // ruhige Einstiegsleiter

    this.o2 = O2_MAX;
    this.meters = 0;
    this.maxUp = 0;
    this.sector = 1;
    this.sectorDef = sectorDef(1);
    this.cooldown = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathReason = null;
    this.time = 0;
    this.combo = 0;
    this.comboT = 0;
    this.run = { meters: 0, coins: 0, drones: 0, boosts: 0, platforms: 0, canisters: 0, sector: 1 };

    while (this.genY > this.camY - H * 1.4) this.generateRow();
    this.state = 'playing';
    this.hooks.onSector?.(1, this.sectorDef, true);
  }

  // ------------------------------------------------------------ Welt bauen
  get difficulty() {
    return clamp(this.meters / 5200, 0, 1) + sectorLoop(this.sector) * 0.22;
  }

  generateRow() {
    const W = this.W;
    const def = this.sectorDefFor(this.genY);
    const d = this.difficulty;

    if (this.easyRows > 0) {
      this.easyRows--;
      const gap = rand(72, 96);
      const y = this.genY - gap;
      const pw = randInt(78, 98);
      const x = clamp(this.lastX + rand(-100, 100) - pw / 2, 8, W - 8 - pw);
      const p = makePlatform(this.easyRows === 2 ? 'moving' : 'normal', x, y, pw, W);
      this.platforms.push(p);
      this.lastType = p.type;
      this.lastX = x + pw / 2;
      this.genY = y;
      if (Math.random() < 0.5) this.pickups.push(makePickup('coin', x + pw / 2, y - 28));
      return;
    }

    // Der Sprung trägt 163 px — die Lücke muss klar darunter bleiben,
    // sonst hängt man bei jedem zweiten Anlauf fest.
    const gapMin = Math.min(lerp(58, 78, Math.min(d, 1)) * def.gap, 88);
    const gapMax = Math.min(lerp(92, 120, Math.min(d, 1)) * def.gap, 128);
    const gap = rand(gapMin, gapMax);
    const y = this.genY - gap;

    const w = { ...def.weights };
    // Plasma ist kein Halt, sondern eine Falle — es steht neben der Reihe,
    // nie an ihrer Stelle. Sonst entstehen Lücken, die niemand springen kann.
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    const plasmaChance = (w.plasma || 0) / total;
    w.plasma = 0;
    // Zwei riskante Plattformen hintereinander wären unfair.
    if (this.lastType === 'ice') w.ice *= 0.4;
    if (this.lastType === 'phase') w.phase *= 0.3;
    if (gap > 112) { w.phase = 0; w.ice *= 0.5; }

    const type = weighted(Object.entries(w));
    const pw = widthFor(type, d);
    // Seitlich schafft man in einem Sprung gut 230 px. Weiter darf die
    // nächste Plattform nie stehen, sonst ist die Reihe nicht zu erreichen.
    const spread = gap > 108 ? 130 : 215;
    const x = clamp(this.lastX + rand(-spread, spread) - pw / 2, 8, W - 8 - pw);

    const p = makePlatform(type, x, y, pw, W);
    this.platforms.push(p);
    this.lastType = type;
    this.lastX = x + pw / 2;
    this.genY = y;

    // Plasmaplatte in dieselbe Reihe, wenn daneben genug Platz bleibt
    if (Math.random() < plasmaChance && type !== 'orbit' && type !== 'moving') {
      const left = x - 26;
      const right = W - (x + pw) - 26;
      const room = Math.max(left, right);
      if (room > 62) {
        const hw = Math.min(randInt(56, 88), room - 8);
        const hx = left > right ? rand(6, left - hw) : rand(x + pw + 26, W - 6 - hw);
        this.platforms.push(makePlatform('plasma', hx, y + rand(-8, 8), hw, W));
      }
    }

    // Aufsammelbares auf/über der Plattform
    this.maybePickup(p, def);

    // Gefahrenband
    if (y < this.nextBand) {
      this.spawnBand(y, def);
      this.nextBand = y - rand(300, 520);
    }
  }

  sectorDefFor(worldY) {
    const m = Math.max(0, (this.startY - worldY) / PX_PER_M);
    return sectorDef(sectorIndex(m));
  }

  maybePickup(p, def) {
    const cx = p.x + p.w / 2;
    const r = Math.random();
    if (r < 0.055) {
      this.pickups.push(makePickup('o2', cx, p.y - 30));
    } else if (r < 0.075) {
      this.pickups.push(makePickup('jet', cx, p.y - 34));
    } else if (r < 0.10) {
      this.pickups.push(makePickup('shield', cx, p.y - 32));
    } else if (r < 0.118) {
      this.pickups.push(makePickup('magnet', cx, p.y - 32));
    } else if (r < 0.40) {
      this.pickups.push(makePickup('coin', cx, p.y - 28));
    } else if (r < 0.47) {
      // Münzbogen
      const n = randInt(3, 6);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        this.pickups.push(makePickup(
          'coin',
          clamp(cx + dir * (t - 0.5) * 120, 20, this.W - 20),
          p.y - 40 - Math.sin(t * Math.PI) * 60,
        ));
      }
    }
  }

  spawnBand(y, def) {
    const W = this.W;
    const lvl = this.sector;
    // Die ersten Meter bleiben ruhig — man soll erst ins Springen kommen.
    const m = (this.startY - y) / PX_PER_M;
    const ramp = clamp(m / 500, 0.15, 1);
    if (Math.random() < def.danger.drone * 0.5 * ramp) {
      this.enemies.push(makeDrone(rand(40, W - 40), y - rand(20, 80), W, lvl));
    }
    if (Math.random() < def.danger.asteroid * 0.5 * ramp) {
      this.enemies.push(makeAsteroid(rand(40, W - 40), y - rand(40, 140), W, lvl));
    }
    if (Math.random() < def.danger.hole * 0.35 * ramp) {
      this.enemies.push(makeHole(rand(70, W - 70), y - rand(60, 160)));
    }
    if (Math.random() < def.danger.asteroid * 0.22 * ramp) {
      this.enemies.push(makeMine(rand(40, W - 40), y - rand(30, 120)));
    }
  }

  // ---------------------------------------------------------------- Update
  update(dt, input) {
    if (this.state === 'idle') return;
    const W = this.W, H = this.H;
    const p = this.player;
    this.time += dt;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    const prevFeet = p.y + p.h * 0.42;
    p.update(dt, input, W);

    if (this.state === 'playing') {
      this.applyGravityWells(dt);
      this.collidePlatforms(prevFeet);
      this.collidePickups(dt);
      this.collideEnemies(dt);
    }

    // Kamera folgt nur nach oben
    const target = p.y - H * 0.44;
    if (target < this.camY) this.camY = target;

    // Höhe/Meter
    const up = Math.max(0, this.startY - p.y);
    if (up > this.maxUp) this.maxUp = up;
    this.meters = this.maxUp / PX_PER_M;
    const idx = sectorIndex(this.meters);
    if (idx !== this.sector) {
      this.sector = idx;
      this.sectorDef = sectorDef(idx);
      this.run.sector = idx;
      sfx.sector();
      this.flashUp('180,240,255', 0.5);
      this.hooks.onSector?.(idx, this.sectorDef, false);
    }

    // Sauerstoff
    if (this.state === 'playing') {
      const drain = 3.6 * this.sectorDef.o2 * (p.perk.o2 || 1);
      this.o2 = Math.max(0, this.o2 - drain * dt);
      if (this.o2 <= 0) this.die('o2');
      else if (this.o2 < 22 && !this.o2Warned) { this.o2Warned = true; }
      else if (this.o2 > 30) this.o2Warned = false;
    }

    // Welt nachbauen und aufräumen
    while (this.genY > this.camY - H * 0.6) this.generateRow();
    const cull = this.camY + H + 400;
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const q = this.platforms[i];
      updatePlatform(q, dt, W);
      if (q.y > cull || (q.dead && q.fade <= 0)) this.platforms.splice(i, 1);
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const u = this.pickups[i];
      updatePickup(u, dt);
      if (u.y > cull || u.taken) this.pickups.splice(i, 1);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      updateEnemy(e, dt, W);
      if (e.y > cull || e.dead) this.enemies.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      updateBolt(b, dt);
      if (b.dead || b.y < this.camY - 120 || b.y > cull || b.x < -30 || b.x > W + 30) this.bolts.splice(i, 1);
      else this.hitBolt(b);
    }

    this.particles.update(dt);
    this.sky.update(dt, this.camY, this.meters, p.vy);

    // Absturz
    if (this.state === 'playing' && p.y - this.camY > H + 80) this.die('fall');
    if (this.state === 'dead' && p.deadT > 1.4 && !this.reported) {
      this.reported = true;
      this.run.meters = Math.floor(this.meters);
      this.run.sector = this.sector;
      this.hooks.onGameOver?.(this.deathReason, this.run);
    }
  }

  applyGravityWells(dt) {
    const p = this.player;
    const anti = p.perk.antiGrav ? -1 : 1;
    for (const e of this.enemies) {
      if (e.kind !== 'hole') continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const R = e.r * 3.6;
      if (d > R) continue;
      const k = 1 - d / R;
      const f = e.pull * k * k * anti;
      p.vx += (dx / d) * f * dt;
      p.vy += (dy / d) * f * dt;
      if (anti > 0 && d < e.r * 1.05) {
        this.killedBy = 'hole';
        this.damage('hole');
      }
    }
  }

  collidePlatforms(prevFeet) {
    const p = this.player;
    if (p.dead || p.stuck) return;
    const feet = p.y + p.h * 0.42;
    const fx = p.x - p.w * 0.34, fw = p.w * 0.68;

    for (const q of this.platforms) {
      if (q.dead) continue;
      if (q.type === 'plasma') {
        // Plasma trifft von allen Seiten
        if (p.invuln <= 0 &&
          p.x + p.w * 0.3 > q.x && p.x - p.w * 0.3 < q.x + q.w &&
          p.y + p.h * 0.42 > q.y - 6 && p.y - p.h * 0.42 < q.y + q.h) {
          this.damage('hit', q.x + q.w / 2, q.y);
        }
        continue;
      }
      if (p.vy <= 0) continue;
      if (!isSolid(q, p.perk.phaseSolid)) continue;
      if (fx + fw < q.x || fx > q.x + q.w) continue;
      if (prevFeet > q.y + 12) continue;
      if (feet < q.y || feet > q.y + q.h + 14) continue;

      this.land(q);
      break;
    }
  }

  land(q) {
    const p = this.player;
    p.y = q.y - p.h * 0.42;
    this.run.platforms++;
    this.o2 = Math.min(O2_MAX, this.o2 + 2.6);
    this.combo++;
    this.comboT = 2.4;

    const cx = q.x + q.w / 2;
    switch (q.type) {
      case 'boost':
        q.fireT = 0.5;
        p.launch(PHYS.boost);
        this.run.boosts++;
        this.o2 = Math.min(O2_MAX, this.o2 + 9);
        sfx.boost();
        this.shakeIt(6);
        this.particles.burst(cx, q.y + 8, 22, {
          dir: Math.PI / 2, spread: 0.7, speed: [120, 340], color: ['#fff3c4', '#ff9a1a', '#ff5722'],
          life: [0.3, 0.7], size: [1.5, 4],
        });
        this.particles.ring(cx, q.y, 'rgba(255,180,80,0.9)', 12, 260, 0.5);
        break;
      case 'magnet':
        p.stuck = q;
        p.stuckT = 0.42;
        q.charge = 1;
        sfx.magnet();
        this.particles.ring(cx, q.y, 'rgba(90,255,190,0.9)', 8, 160, 0.45);
        break;
      case 'ice': {
        q.hits++;
        p.jump(1, sfx.jump);
        const limit = p.perk.iceTough ? 2 : 1;
        if (q.hits >= limit) {
          breakPlatform(q);
          sfx.crumble();
          this.particles.burst(cx, q.y + 4, 14, {
            speed: [40, 180], color: ['#e6faff', '#9fe6ff', '#5fb6d6'],
            life: [0.35, 0.8], size: [2, 5], type: 'shard', g: 480,
          });
        }
        break;
      }
      case 'portal': {
        const from = p.x;
        p.x = clamp(q.link, 24, this.W - 24);
        p.jump(1.05, sfx.portal);
        p.warp = 1;
        this.particles.ring(from, q.y, 'rgba(80,230,255,0.9)', 6, 220, 0.4);
        this.particles.ring(p.x, q.y, 'rgba(80,230,255,0.9)', 6, 220, 0.4);
        this.particles.burst(p.x, q.y, 12, { speed: [60, 200], color: ['#dbfaff', '#33e0ff'], life: [0.2, 0.5], size: [1.5, 3] });
        break;
      }
      case 'phase':
        p.jump(1, sfx.phase);
        break;
      default:
        p.jump(1, sfx.jump);
        this.particles.burst(cx, q.y + 2, 6, {
          dir: Math.PI / 2, spread: 1.1, speed: [30, 110],
          color: [TYPES[q.type]?.glow || '#9fd', '#ffffff'], life: [0.15, 0.35], size: [1, 2.4],
        });
        break;
    }

    if (this.combo >= 5 && this.combo % 5 === 0) {
      this.particles.ring(cx, q.y, 'rgba(255,224,138,0.7)', 10, 200, 0.45);
    }
  }

  collidePickups() {
    const p = this.player;
    if (p.dead) return;
    const magnetR = 78 * (p.perk.magnet || 1) * (p.magnet > 0 ? 3.2 : 1);
    for (const u of this.pickups) {
      if (u.taken) continue;
      const dx = p.x - u.x, dy = p.y - u.y;
      const d = Math.hypot(dx, dy);
      if (u.kind === 'coin' && d < magnetR) {
        u.mag = 1;
        const s = lerp(90, 620, 1 - d / magnetR);
        u.vx = (dx / (d || 1)) * s;
        u.vy = (dy / (d || 1)) * s;
      }
      if (d > u.r + 18) continue;
      u.taken = true;
      switch (u.kind) {
        case 'coin':
          this.run.coins++;
          sfx.coin();
          this.particles.burst(u.x, u.y, 7, { speed: [40, 150], color: ['#fff3b0', '#ffcc33'], life: [0.2, 0.45], size: [1.2, 2.6] });
          break;
        case 'o2':
          this.o2 = Math.min(O2_MAX, this.o2 + 34);
          this.run.canisters++;
          sfx.oxygen();
          this.particles.text(u.x, u.y - 14, '+O₂', '#7ef0ff');
          this.particles.ring(u.x, u.y, 'rgba(126,240,255,0.8)', 8, 150, 0.4);
          break;
        case 'jet':
          p.giveJet();
          sfx.boost();
          this.particles.text(u.x, u.y - 14, 'Rucksack!', '#ffb03a');
          this.shakeIt(4);
          break;
        case 'shield':
          p.shield = 1;
          sfx.shield();
          this.particles.text(u.x, u.y - 14, 'Schild', '#9fe8ff');
          this.particles.ring(p.x, p.y, 'rgba(160,230,255,0.9)', 10, 190, 0.5);
          break;
        case 'magnet':
          p.magnet = 9;
          sfx.magnet();
          this.particles.text(u.x, u.y - 14, 'Magnet', '#c99dff');
          break;
        default: break;
      }
    }
  }

  collideEnemies() {
    const p = this.player;
    if (p.dead) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.kind === 'hole') continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy);

      if (e.kind === 'mine') {
        if (d < 46 && e.armed <= 0 && !e.exploding) {
          e.armed = 0.55;
        }
        if (e.exploding) {
          e.exploding = false;
          e.dead = true;
          this.particles.burst(e.x, e.y, 26, {
            speed: [80, 320], color: ['#fff3c4', '#ff9a1a', '#ff4020'], life: [0.3, 0.7], size: [2, 5],
          });
          this.particles.ring(e.x, e.y, 'rgba(255,170,80,0.9)', 12, 420, 0.45);
          this.shakeIt(9);
          sfx.hit();
          if (d < 70) this.damage('hit', e.x, e.y);
        }
        continue;
      }

      const hitR = (e.r || 16) + 15;
      if (d > hitR) continue;

      if (e.kind === 'drone' && p.vy > 120 && p.y < e.y - 4) {
        // Von oben draufspringen
        e.dead = true;
        this.run.drones++;
        p.launch(PHYS.stomp);
        sfx.hit();
        this.shakeIt(5);
        this.particles.burst(e.x, e.y, 18, {
          speed: [70, 260], color: ['#ff6b6b', '#ffd166', '#c8d6e8'], life: [0.25, 0.6], size: [1.6, 4],
        });
        this.particles.text(e.x, e.y - 18, '+25', '#ffd166');
        continue;
      }
      if (p.jetT > 0 && e.kind !== 'hole') {
        // Mit Rucksack pflügt man durch
        e.dead = true;
        if (e.kind === 'drone') this.run.drones++;
        this.particles.burst(e.x, e.y, 16, { speed: [60, 240], color: ['#ffd166', '#ff9a1a'], life: [0.2, 0.5], size: [1.5, 3.5] });
        continue;
      }
      this.damage('hit', e.x, e.y);
    }
  }

  hitBolt(b) {
    if (b.hostile) {
      const p = this.player;
      if (!p.dead && Math.hypot(p.x - b.x, p.y - b.y) < 18) {
        b.dead = true;
        this.damage('hit', b.x, b.y);
      }
      return;
    }
    for (const e of this.enemies) {
      if (e.dead || e.kind === 'hole') continue;
      const r = (e.r || 14) + 4;
      if (Math.hypot(e.x - b.x, e.y - b.y) > r) continue;
      b.dead = true;
      e.hp = (e.hp || 1) - 1;
      this.particles.burst(b.x, b.y, 8, { speed: [50, 180], color: ['#dbfaff', '#7fe3ff'], life: [0.15, 0.4], size: [1.2, 2.8] });
      if (e.hp <= 0) {
        e.dead = true;
        if (e.kind === 'drone') { this.run.drones++; this.particles.text(e.x, e.y - 16, '+25', '#ffd166'); }
        sfx.hit();
        this.particles.burst(e.x, e.y, 18, {
          speed: [70, 280],
          color: e.kind === 'asteroid' ? ['#9a8b7c', '#6a5c50', '#ffd166'] : ['#ff6b6b', '#c8d6e8'],
          life: [0.25, 0.65], size: [1.6, 4.5], type: 'shard',
        });
      }
      break;
    }
  }

  damage(reason, x, y) {
    const p = this.player;
    const res = p.hurt();
    if (res === 'none') return;
    if (res === 'shield') {
      sfx.shield();
      this.shakeIt(8);
      this.flashUp('160,230,255', 0.6);
      this.particles.ring(p.x, p.y, 'rgba(160,230,255,0.95)', 16, 340, 0.5);
      this.particles.burst(x ?? p.x, y ?? p.y, 14, { speed: [70, 240], color: ['#cdf3ff', '#5ab8ff'], life: [0.2, 0.5], size: [1.4, 3.2] });
      return;
    }
    this.die(reason);
  }

  die(reason) {
    if (this.state !== 'playing') return;
    const p = this.player;
    p.dead = true;
    p.deadT = 0;
    p.shield = 0;
    p.jetT = 0;
    this.state = 'dead';
    this.deathReason = reason;
    this.reported = false;
    sfx.death();
    this.shakeIt(14);
    this.flashUp('255,80,80', 0.8);
    this.particles.burst(p.x, p.y, 30, {
      speed: [80, 320], color: ['#ffffff', '#ffd166', '#ff6b6b'], life: [0.4, 0.9], size: [1.6, 4.5],
    });
  }

  shoot(tx, ty) {
    if (this.state !== 'playing' || this.cooldown > 0 || this.player.dead) return;
    const p = this.player;
    this.cooldown = 0.42 * (p.perk.fireRate || 1);
    let dx = (tx ?? p.x) - p.x;
    let dy = (ty ?? (p.y - 200)) - p.y;
    if (dy > -30) dy = -30;
    const l = Math.hypot(dx, dy) || 1;
    const sp = 760;
    this.bolts.push(makeBolt(p.x, p.y - 10, (dx / l) * sp, (dy / l) * sp, false));
    sfx.shoot();
    this.particles.burst(p.x + (dx / l) * 14, p.y - 10 + (dy / l) * 14, 4, {
      speed: [20, 80], color: ['#dbfaff'], life: [0.1, 0.25], size: [1, 2],
    });
    p.vy += 26; // leichter Rückstoß
  }

  shakeIt(v) { this.shake = Math.max(this.shake, v); }
  flashUp(color, v) { this.flashColor = color; this.flash = Math.max(this.flash, v); }

  // ---------------------------------------------------------------- Zeichnen
  draw() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Ränder außerhalb des Spielfelds
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    this.sky.draw(ctx, this.camY, this.player ? this.player.vy : 0);

    if (this.state !== 'idle') {
      const camY = this.camY;

      // Schwerkraftfelder zuerst — sie liegen optisch hinter allem
      for (const e of this.enemies) if (e.kind === 'hole') drawEnemy(ctx, e, camY);

      for (const q of this.platforms) {
        if (q.y - camY < -60 || q.y - camY > H + 60) continue;
        drawPlatform(ctx, q, { camY, phaseSolid: this.player.perk.phaseSolid });
      }

      for (const u of this.pickups) {
        if (u.y - camY < -40 || u.y - camY > H + 40) continue;
        drawPickup(ctx, u, camY);
      }

      for (const e of this.enemies) {
        if (e.kind === 'hole') continue;
        if (e.y - camY < -60 || e.y - camY > H + 60) continue;
        drawEnemy(ctx, e, camY);
      }

      for (const b of this.bolts) drawBolt(ctx, b, camY);

      this.particles.draw(ctx, camY);
      this.player.draw(ctx, camY, this.settings.trail);

      this.drawEdgeHints(ctx);
    }

    this.sky.drawVignette(ctx);

    // Sauerstoffwarnung als roter Rand
    if (this.state === 'playing' && this.o2 < 28) {
      const k = 1 - this.o2 / 28;
      const pulse = 0.35 + Math.sin(this.time * 7) * 0.25;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${0.55 * k * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  /** Pfeile am Rand, wenn oben etwas Wichtiges knapp außer Sicht ist. */
  drawEdgeHints(ctx) {
    const camY = this.camY;
    for (const u of this.pickups) {
      if (u.kind !== 'jet' && u.kind !== 'shield' && u.kind !== 'o2') continue;
      const y = u.y - camY;
      if (y > -160 || y < -520) continue;
      const a = clamp(1 - (-y - 160) / 360, 0, 1) * 0.8;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(clamp(u.x, 18, this.W - 18), 14);
      ctx.fillStyle = u.kind === 'jet' ? '#ffb03a' : u.kind === 'shield' ? '#9fe8ff' : '#7ef0ff';
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(6, 4); ctx.lineTo(-6, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Kleine Vorschau für den Startbildschirm: nur Hintergrund + Figur. */
  drawIdle(skin, t) {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    this.sky.update(1 / 60, this.idleCam ?? 0, 0, 0);
    this.idleCam = (this.idleCam ?? 0) - 26 / 60;
    this.sky.draw(ctx, this.idleCam, -200);
    this.sky.drawVignette(ctx);
    ctx.restore();
  }

  hud() {
    return {
      meters: Math.floor(this.meters),
      o2: this.o2 / O2_MAX,
      coins: this.run ? this.run.coins : 0,
      sector: this.sector,
      sectorName: this.sectorDef ? this.sectorDef.name : '',
      shield: this.player ? this.player.shield > 0 : false,
      jet: this.player ? Math.max(0, this.player.jetT) / PHYS.jetTime : 0,
      magnet: this.player ? Math.max(0, this.player.magnet) / 9 : 0,
      combo: this.combo,
    };
  }
}
