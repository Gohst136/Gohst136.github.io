/* Die Arena: ein vertikaler Auto-Battler.
   Dein Kern steht unten, die Wellen kommen von oben. Jede ausgerüstete
   Fähigkeit feuert auf ihrer eigenen Abklingzeit — sichtbar unterschiedlich,
   je nachdem, aus welchen Elementen sie besteht. */

import {
  ELEMENTS, ENEMY_TYPES, BOSS_NAMES, BOSS_HP_MULT,
  enemyHp, enemyDamage, enemyCount, essencePerKill, waveBonus, isBossWave
} from './data.js';
import { clamp, TAU, withAlpha, lighten, rng, fmt } from './util.js';

const MAX_PARTICLES = 320;

export class Arena {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks;              /* { getDeck, getWave, getCore, onEssence, onWaveCleared, onDefeat, onHud } */
    this.dpr = 1;
    this.W = 360; this.H = 640;

    this.enemies = [];
    this.shots = [];
    this.flashes = [];
    this.parts = [];
    this.numbers = [];

    this.running = false;
    this.last = 0;
    this.acc = 0;
    this.shake = 0;
    this.time = 0;
    this.banner = null;

    this.core = { hp: 100, max: 100, x: 0, y: 0, r: 26, hitT: 0 };
    this.focus = 0; this.focusActive = 0;
    this.cooldowns = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveState = 'idle';         /* idle | fighting | cleared | dead */
    this.clearedTimer = 0;
    this.stars = null;

    this._loop = this._loop.bind(this);
    canvas.addEventListener('pointerdown', (e) => this._tap(e), { passive: true });
  }

  /* ---------------- Aufbau ---------------- */

  resize() {
    const rect = this.cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.round(rect.width);
    this.H = Math.round(rect.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.core.x = this.W / 2;
    this.core.y = this.H - 78;
    this._buildStars();
  }

  _buildStars() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    const r = rng(1337);
    for (let i = 0; i < Math.round(this.W * this.H / 5200); i++) {
      const x = r() * this.W, y = r() * this.H, s = r() * 1.6 + 0.3;
      g.fillStyle = `rgba(190,200,255,${0.15 + r() * 0.45})`;
      g.fillRect(x, y, s, s);
    }
    this.stars = c;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

  /* Nach jeder Deck-Änderung: Abklingzeiten an die neue Bestückung anpassen. */
  syncDeck() {
    const deck = this.hooks.getDeck();
    this.cooldowns = deck.map((a, i) => {
      if (!a) return 0;
      const prev = this.cooldowns[i];
      return prev == null ? a.stats.cd * 0.3 : Math.min(prev, a.stats.cd);
    });
  }

  /* ---------------- Wellenablauf ---------------- */

  beginWave(wave) {
    const core = this.hooks.getCore();
    this.core.max = core.maxHp;
    this.core.hp = clamp(this.core.hp <= 0 ? core.maxHp : this.core.hp, 1, core.maxHp);
    this.enemies.length = 0;
    this.shots.length = 0;
    this.numbers.length = 0;
    this.wave = wave;
    this.waveState = 'fighting';
    this.spawnQueue = [];
    this.killsThisWave = 0;
    this.repeatWave = false;

    const boss = isBossWave(wave);
    const n = boss ? Math.max(3, Math.round(enemyCount(wave) * 0.5)) : enemyCount(wave);
    const pool = ENEMY_TYPES.filter(t => t.from <= wave);
    const r = rng(wave * 7919 + 13);
    for (let i = 0; i < n; i++) {
      const t = pool[Math.floor(r() * pool.length)];
      this.spawnQueue.push({ type: t, delay: i * (boss ? 560 : 420) + r() * 240 });
    }
    if (boss) {
      this.spawnQueue.push({ type: ENEMY_TYPES[ENEMY_TYPES.length - 1], delay: 900, boss: true });
    }
    this.spawnTimer = 0;
    this.cooldowns = this.hooks.getDeck().map(a => (a ? a.stats.cd * 0.35 : 0));
    this.banner = { text: boss ? `WELLE ${wave} — ${BOSS_NAMES[(wave / 5 - 1) % BOSS_NAMES.length]}` : `WELLE ${wave}`, t: 0, boss };
  }

  /* ---------------- Eingabe ---------------- */

  _tap() {
    this.tryFocus();
  }

  tryFocus() {
    if (this.focus < 1 || this.focusActive > 0) return false;
    this.focus = 0;
    this.focusActive = 5000;
    this.shake = Math.max(this.shake, 14);
    this._ring(this.core.x, this.core.y, 40, this.W, '#ffffff', 520);
    return true;
  }

  /* ---------------- Schleife ---------------- */

  _loop(now) {
    if (!this.running) return;
    let dt = now - this.last;
    this.last = now;
    /* rAF-Zeitstempel können vor performance.now() liegen -> nie negativ rechnen. */
    if (dt < 0) dt = 0;
    if (dt > 90) dt = 90;                 /* nach Tab-Wechsel nicht überspringen */
    this.time += dt;
    this._update(dt);
    this._render();
    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    const core = this.hooks.getCore();
    const deck = this.hooks.getDeck();

    if (this.focusActive > 0) this.focusActive = Math.max(0, this.focusActive - dt);

    /* Kern-Regeneration */
    if (this.core.hp > 0 && this.core.hp < this.core.max) {
      this.core.hp = Math.min(this.core.max, this.core.hp + core.regen * dt / 1000);
    }
    if (this.core.hitT > 0) this.core.hitT -= dt;

    if (this.waveState === 'fighting') {
      /* Nachschub */
      this.spawnTimer += dt;
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (this.spawnTimer >= this.spawnQueue[i].delay) {
          this._spawn(this.spawnQueue[i]);
          this.spawnQueue.splice(i, 1);
        }
      }
      /* Fähigkeiten feuern */
      const haste = this.focusActive > 0 ? 0.42 : 1;
      for (let i = 0; i < deck.length; i++) {
        const a = deck[i];
        if (!a) continue;
        this.cooldowns[i] = (this.cooldowns[i] ?? 0) - dt;
        if (this.cooldowns[i] <= 0 && this.enemies.length) {
          this.cooldowns[i] = a.stats.cd * haste;
          this._fire(a);
          if (Math.random() < a.stats.echo) {
            setTimeout(() => { if (this.enemies.length) this._fire(a, true); }, 150);
          }
        }
      }
      if (!this.spawnQueue.length && !this.enemies.length) {
        this.waveState = 'cleared';
        this.clearedTimer = 0;
        if (this.killsThisWave === 0) {
          /* Alles ist einfach durchmarschiert — das ist keine geschaffte Welle.
             Sonst rutscht man in Wellen, gegen die man nichts ausrichten kann. */
          this.repeatWave = true;
          this.banner = { text: 'ZU STARK — AB IN DIE SCHMIEDE', t: 0, boss: true };
        } else {
          this.repeatWave = false;
          const bonus = Math.round(waveBonus(this.wave) * core.greed);
          this.hooks.onEssence(bonus, 'wave');
          this.banner = { text: `WELLE ${this.wave} GESCHAFFT  +${fmt(bonus)}✦`, t: 0, good: true };
          this.hooks.onWaveCleared(this.wave);
        }
      }
    } else if (this.waveState === 'cleared') {
      this.clearedTimer += dt;
      if (this.clearedTimer > 1300) this.beginWave(this.repeatWave ? this.wave : this.wave + 1);
    }

    this._updateEnemies(dt, core);
    this._updateShots(dt);
    this._updateFx(dt);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.05);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2200) this.banner = null; }

    this.hooks.onHud({
      hp: this.core.hp, max: this.core.max,
      focus: this.focus, focusActive: this.focusActive,
      cooldowns: this.cooldowns.slice(), deck,
      wave: this.wave, alive: this.enemies.length + this.spawnQueue.length,
      state: this.waveState
    });
  }

  /* ---------------- Gegner ---------------- */

  _spawn(entry) {
    const t = entry.type;
    const boss = !!entry.boss;
    const hpBase = enemyHp(this.wave) * t.hp * (boss ? BOSS_HP_MULT : 1);
    const r = 22 + Math.random() * (this.W - 44);
    this.enemies.push({
      x: boss ? this.W / 2 : r,
      y: -40 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 14,
      hp: hpBase, max: hpBase,
      type: t, boss,
      radius: t.r * (boss ? 2.1 : 1) * (this.W < 380 ? 0.92 : 1),
      /* Tempo relativ zur Arenahöhe: auf jedem Gerät gleich viel Reaktionszeit. */
      speed: (this.H / 14) * (1 + this.wave * 0.012) * t.speed * (boss ? 0.55 : 1),
      dmg: enemyDamage(this.wave) * t.dmg * (boss ? 2.4 : 1),
      rot: Math.random() * TAU,
      burn: 0, burnT: 0, slowT: 0, slowF: 1, hitT: 0,
      name: boss ? BOSS_NAMES[(this.wave / 5 - 1) % BOSS_NAMES.length] : t.name
    });
  }

  _updateEnemies(dt, core) {
    const s = dt / 1000;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      /* Beim Tod des Kerns wird die Liste mitten in der Schleife geleert. */
      if (!e) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        this._damage(e, e.burn * s, { silent: true, dot: true });
        if (Math.random() < 0.25) this._particle(e.x + (Math.random() - 0.5) * e.radius, e.y, -30 - Math.random() * 40, (Math.random() - 0.5) * 30, '#ff9d2f', 420, 2);
      }
      if (e.hitT > 0) e.hitT -= dt;
      if (e.hp <= 0) continue;

      e.y += e.speed * e.slowF * s;
      e.x += e.vx * s;
      if (e.x < e.radius) { e.x = e.radius; e.vx *= -1; }
      if (e.x > this.W - e.radius) { e.x = this.W - e.radius; e.vx *= -1; }
      e.rot += s * (e.boss ? 0.4 : 0.9);

      /* Kern erreicht */
      if (e.y > this.core.y - this.core.r - e.radius * 0.6) {
        this._hitCore(e.dmg);
        this._burst(e.x, e.y, e.type.color, 16);
        if (this.waveState === 'dead') break;
        this.enemies.splice(i, 1);
      }
    }
  }

  _hitCore(dmg) {
    this.core.hp -= dmg;
    this.core.hitT = 260;
    this.shake = Math.max(this.shake, 10);
    if (this.core.hp <= 0) {
      this.core.hp = 0;
      this.waveState = 'dead';
      this.shake = 22;
      this._burst(this.core.x, this.core.y, '#ff5b8a', 60);
      this.enemies.length = 0;
      this.shots.length = 0;
      this.spawnQueue.length = 0;
      this.hooks.onDefeat(this.wave);
    }
  }

  /* ---------------- Angriffe ---------------- */

  _targets(n) {
    if (!this.enemies.length) return [];
    const sorted = this.enemies.slice().sort((a, b) => b.y - a.y);
    const out = [];
    for (let i = 0; i < n; i++) out.push(sorted[i % sorted.length]);
    return out;
  }

  _fire(a, isEcho) {
    const st = a.stats;
    const boost = this.focusActive > 0 ? 1.6 : 1;
    const targets = this._targets(st.count);
    if (!targets.length) return;

    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      const dmg = st.dmg * boost * (isEcho ? 0.7 : 1);
      const spread = (i - (targets.length - 1) / 2) * 12;

      if (a.shot === 'bolt' || a.shot === 'beam') {
        /* Sofortwirkung: Strahl bzw. Blitz */
        const pierce = a.shot === 'beam' ? st.pierce + 1 : 0;
        this.flashes.push({
          kind: a.shot, x1: this.core.x + spread, y1: this.core.y - 20,
          x2: tgt.x, y2: tgt.y, color: a.colors.glow, t: 0, life: a.shot === 'beam' ? 220 : 160,
          w: a.shot === 'beam' ? 4 + st.count : 3, seed: Math.random() * 999
        });
        this._impact(a, tgt, dmg);
        if (pierce > 0) {
          const others = this.enemies
            .filter(e => e !== tgt && Math.abs(e.x - tgt.x) < 34 && e.y < tgt.y)
            .slice(0, pierce);
          for (const o of others) this._impact(a, o, dmg * 0.8);
        }
      } else {
        const dx = tgt.x - this.core.x, dy = tgt.y - (this.core.y - 20);
        const len = Math.hypot(dx, dy) || 1;
        this.shots.push({
          a, x: this.core.x + spread, y: this.core.y - 20,
          vx: (dx / len) * st.speed + spread * 0.6,
          vy: (dy / len) * st.speed,
          dmg, r: a.shot === 'shard' ? 9 : a.shot === 'blade' ? 6 : 8,
          kind: a.shot, life: 3000, hits: [], pierce: st.pierce,
          target: a.shot === 'wisp' ? tgt : null,
          spin: Math.random() * TAU, trail: []
        });
      }
    }
  }

  _updateShots(dt) {
    const s = dt / 1000;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const p = this.shots[i];
      p.life -= dt;
      if (p.life <= 0) { this.shots.splice(i, 1); continue; }

      if (p.kind === 'wisp' && p.target && p.target.hp > 0) {
        const dx = p.target.x - p.x, dy = p.target.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = p.a.stats.speed;
        p.vx += (dx / len * sp - p.vx) * Math.min(1, s * 6);
        p.vy += (dy / len * sp - p.vy) * Math.min(1, s * 6);
      }
      if (p.kind === 'shard') p.vy += 260 * s;
      if (p.kind === 'rune') {
        p.spin += s * 8;
        p.x += Math.cos(p.spin) * 60 * s;
      }
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.spin += s * 6;

      p.trail.push(p.x, p.y);
      if (p.trail.length > 12) p.trail.splice(0, 2);

      if (p.y < -60 || p.x < -60 || p.x > this.W + 60 || p.y > this.H + 60) {
        this.shots.splice(i, 1); continue;
      }

      for (const e of this.enemies) {
        if (e.hp <= 0 || p.hits.includes(e)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= e.radius + p.r) {
          p.hits.push(e);
          this._impact(p.a, e, p.dmg);
          if (p.hits.length > p.pierce) { this.shots.splice(i, 1); }
          break;
        }
      }
    }
  }

  /* Treffer inkl. aller Elementeffekte. */
  _impact(a, enemy, dmg) {
    const st = a.stats;
    const crit = Math.random() < st.crit;
    const total = dmg * (crit ? st.critMult : 1);
    this._damage(enemy, total, { crit, color: a.colors.glow });

    this._burst(enemy.x, enemy.y, a.colors.a, crit ? 14 : 7);
    this._ring(enemy.x, enemy.y, 4, Math.max(18, st.aoe * 0.5), a.colors.glow, 320);

    /* Flächenschaden */
    if (st.aoe > 34) {
      for (const o of this.enemies.slice()) {
        if (o === enemy || o.hp <= 0) continue;
        if (Math.hypot(o.x - enemy.x, o.y - enemy.y) < st.aoe) {
          this._damage(o, total * 0.55, { color: a.colors.a });
        }
      }
    }
    /* Brand */
    if (st.burn > 0.05) {
      enemy.burn = Math.max(enemy.burn, total * st.burn / 3);
      enemy.burnT = 3000;
    }
    /* Frost */
    if (st.slow > 0.05) {
      enemy.slowF = Math.min(enemy.slowF, 1 - st.slow);
      enemy.slowT = 2200;
    }
    /* Kettenblitz */
    if (st.chain > 0) {
      let from = enemy, left = st.chain;
      const done = [enemy];
      while (left-- > 0) {
        let best = null, bd = 240;
        for (const o of this.enemies) {
          if (o.hp <= 0 || done.includes(o)) continue;
          const d = Math.hypot(o.x - from.x, o.y - from.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) break;
        this.flashes.push({
          kind: 'bolt', x1: from.x, y1: from.y, x2: best.x, y2: best.y,
          color: a.colors.glow, t: 0, life: 140, w: 2, seed: Math.random() * 999
        });
        this._damage(best, total * 0.5, { color: a.colors.glow });
        done.push(best); from = best;
      }
    }
    /* Zehren */
    if (st.lifesteal > 0.005 && this.core.hp > 0) {
      const heal = total * st.lifesteal;
      this.core.hp = Math.min(this.core.max, this.core.hp + heal);
      this._particle(enemy.x, enemy.y, (this.core.x - enemy.x) * 0.4, (this.core.y - enemy.y) * 0.4, '#b06bff', 620, 3);
    }
  }

  _damage(enemy, amount, opt = {}) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    enemy.hitT = 90;
    if (!opt.silent) {
      this.numbers.push({
        x: enemy.x + (Math.random() - 0.5) * 14, y: enemy.y - enemy.radius * 0.4,
        v: -34 - Math.random() * 20, t: 0, life: 720,
        text: fmt(amount), crit: !!opt.crit, color: opt.crit ? '#ffe066' : (opt.color || '#ffffff')
      });
      if (this.numbers.length > 40) this.numbers.shift();
    }
    /* Fokus lädt durch ausgeteilten Schaden */
    if (!opt.dot) {
      const core = this.hooks.getCore();
      this.focus = Math.min(1, this.focus + (amount / Math.max(1, enemy.max)) * 0.09 * core.focusRate);
    }
    if (enemy.hp <= 0) this._kill(enemy);
  }

  _kill(enemy) {
    const idx = this.enemies.indexOf(enemy);
    if (idx < 0) return;
    this.enemies.splice(idx, 1);
    this._burst(enemy.x, enemy.y, enemy.type.color, enemy.boss ? 70 : 18);
    this._ring(enemy.x, enemy.y, enemy.radius, enemy.radius * (enemy.boss ? 7 : 3), enemy.type.color, enemy.boss ? 700 : 380);
    if (enemy.boss) this.shake = Math.max(this.shake, 18);
    const core = this.hooks.getCore();
    const gain = essencePerKill(this.wave) * (enemy.boss ? 14 : 1) * core.greed;
    this.hooks.onEssence(gain, 'kill');
    this.killsThisWave++;
  }

  /* ---------------- Effekte ---------------- */

  _particle(x, y, vx, vy, color, life, r) {
    if (this.parts.length > MAX_PARTICLES) this.parts.shift();
    this.parts.push({ x, y, vx, vy, color, life, max: life, r: r || 2 });
  }
  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU, sp = 40 + Math.random() * 190;
      this._particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 320 + Math.random() * 380, 1 + Math.random() * 2.4);
    }
  }
  _ring(x, y, r0, r1, color, life) {
    this.flashes.push({ kind: 'ring', x, y, r0, r1, color, t: 0, life });
  }

  _updateFx(dt) {
    const s = dt / 1000;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * s; p.y += p.vy * s;
      p.vx *= 0.97; p.vy = p.vy * 0.97 + 60 * s;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.life) this.flashes.splice(i, 1);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt; n.y += n.v * s; n.v *= 0.94;
      if (n.t >= n.life) this.numbers.splice(i, 1);
    }
  }

  /* ---------------- Zeichnen ---------------- */

  _render() {
    const g = this.ctx, W = this.W, H = this.H;
    g.save();
    if (this.shake > 0.4) {
      g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    /* Hintergrund */
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07030f');
    bg.addColorStop(0.55, '#0d0524');
    bg.addColorStop(1, '#180a33');
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);

    if (this.stars) {
      const off = (this.time * 0.012) % H;
      g.globalAlpha = 0.6;
      g.drawImage(this.stars, 0, off);
      g.drawImage(this.stars, 0, off - H);
      g.globalAlpha = 1;
    }

    /* Bodenlinie */
    const lineY = this.core.y - this.core.r - 6;
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, lineY); g.lineTo(W, lineY); g.stroke();

    if (this.focusActive > 0) {
      g.fillStyle = `rgba(140,90,255,${0.10 + 0.05 * Math.sin(this.time / 90)})`;
      g.fillRect(0, 0, W, H);
    }

    this._drawShots(g);
    this._drawEnemies(g);
    this._drawFlashes(g);
    this._drawParticles(g);
    this._drawCore(g);
    this._drawNumbers(g);
    this._drawBanner(g);

    g.restore();
  }

  _drawEnemies(g) {
    for (const e of this.enemies) {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.rot);
      const col = e.hitT > 0 ? '#ffffff' : e.type.color;
      g.beginPath();
      for (let i = 0; i < e.type.sides; i++) {
        const ang = (i / e.type.sides) * TAU;
        const x = Math.cos(ang) * e.radius, y = Math.sin(ang) * e.radius;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      const grad = g.createRadialGradient(0, -e.radius * 0.3, 1, 0, 0, e.radius);
      grad.addColorStop(0, withAlpha(lighten(col, 0.5), 0.95));
      grad.addColorStop(1, withAlpha(col, e.boss ? 0.85 : 0.55));
      g.fillStyle = grad;
      g.shadowBlur = e.boss ? 26 : 12;
      g.shadowColor = withAlpha(col, 0.9);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 2;
      g.strokeStyle = withAlpha(lighten(col, 0.6), 0.9);
      g.stroke();
      if (e.slowF < 1) {
        g.strokeStyle = 'rgba(120,230,255,0.85)';
        g.lineWidth = 3; g.stroke();
      }
      g.restore();

      /* Lebensbalken */
      const w = e.radius * 2, hp = clamp(e.hp / e.max, 0, 1);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
      g.fillStyle = e.boss ? '#ff5b8a' : '#8affc1';
      g.fillRect(e.x - w / 2, e.y - e.radius - 10, w * hp, 4);
      if (e.boss) {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.font = '600 12px ui-rounded, -apple-system, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(e.name, e.x, e.y - e.radius - 16);
      }
    }
  }

  _drawShots(g) {
    for (const p of this.shots) {
      const c = p.a.colors;
      /* Schweif */
      if (p.trail.length >= 4) {
        g.beginPath();
        g.moveTo(p.trail[0], p.trail[1]);
        for (let i = 2; i < p.trail.length; i += 2) g.lineTo(p.trail[i], p.trail[i + 1]);
        g.strokeStyle = withAlpha(c.a, 0.35);
        g.lineWidth = p.r * 1.1;
        g.lineCap = 'round';
        g.stroke();
      }
      g.save();
      g.translate(p.x, p.y);
      g.shadowBlur = 16;
      g.shadowColor = withAlpha(c.glow, 1);
      g.fillStyle = withAlpha(lighten(c.glow, 0.3), 0.98);
      if (p.kind === 'blade') {
        g.rotate(Math.atan2(p.vy, p.vx));
        g.beginPath();
        g.ellipse(0, 0, p.r * 2.2, p.r * 0.5, 0, 0, TAU);
        g.fill();
      } else if (p.kind === 'shard') {
        g.rotate(p.spin);
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * TAU, rr = i % 2 ? p.r * 0.5 : p.r * 1.4;
          const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath(); g.fill();
      } else if (p.kind === 'rune') {
        g.rotate(p.spin);
        g.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        g.rotate(Math.PI / 4);
        g.fillRect(-p.r * 0.7, -p.r * 0.7, p.r * 1.4, p.r * 1.4);
      } else {
        g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.fill();
      }
      g.restore();
    }
  }

  _drawFlashes(g) {
    for (const f of this.flashes) {
      const k = 1 - f.t / f.life;
      if (f.kind === 'ring') {
        const r = f.r0 + (f.r1 - f.r0) * (1 - k);
        g.beginPath();
        g.arc(f.x, f.y, r, 0, TAU);
        g.strokeStyle = withAlpha(f.color, k * 0.75);
        g.lineWidth = 2 + k * 3;
        g.stroke();
      } else if (f.kind === 'beam') {
        g.beginPath();
        g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2);
        g.strokeStyle = withAlpha(f.color, k * 0.9);
        g.lineWidth = f.w * k;
        g.shadowBlur = 22; g.shadowColor = withAlpha(f.color, 1);
        g.lineCap = 'round';
        g.stroke();
        g.shadowBlur = 0;
      } else if (f.kind === 'bolt') {
        const r = rng(f.seed | 0);
        g.beginPath();
        g.moveTo(f.x1, f.y1);
        const steps = 6;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const x = f.x1 + (f.x2 - f.x1) * t + (r() - 0.5) * 26;
          const y = f.y1 + (f.y2 - f.y1) * t + (r() - 0.5) * 14;
          g.lineTo(x, y);
        }
        g.lineTo(f.x2, f.y2);
        g.strokeStyle = withAlpha(lighten(f.color, 0.4), k);
        g.lineWidth = f.w;
        g.shadowBlur = 18; g.shadowColor = withAlpha(f.color, 1);
        g.stroke();
        g.shadowBlur = 0;
      }
    }
  }

  _drawParticles(g) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r * (0.4 + k * 0.9), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  _drawCore(g) {
    const { x, y, r } = this.core;
    const deck = this.hooks.getDeck().filter(Boolean);
    const col = deck.length ? deck[0].colors.glow : '#8a4dff';
    const pulse = 1 + Math.sin(this.time / 380) * 0.05 + (this.focusActive > 0 ? 0.12 : 0);

    g.save();
    g.translate(x, y);
    g.scale(pulse, pulse);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i / 6) * TAU;
      const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.5, withAlpha(lighten(col, 0.3), 0.95));
    grd.addColorStop(1, withAlpha(col, 0.7));
    g.fillStyle = this.core.hitT > 0 ? '#ff6b8b' : grd;
    g.shadowBlur = 30; g.shadowColor = withAlpha(col, 0.95);
    g.fill();
    g.restore();

    /* Schutzbogen als Lebensanzeige */
    const hp = clamp(this.core.hp / this.core.max, 0, 1);
    g.beginPath();
    g.arc(x, y, r + 12, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * hp);
    g.strokeStyle = hp > 0.4 ? '#7dffb0' : '#ff5b8a';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.stroke();
    g.beginPath();
    g.arc(x, y, r + 12, Math.PI * 0.75, Math.PI * 2.25);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 4;
    g.stroke();
  }

  _drawNumbers(g) {
    g.textAlign = 'center';
    for (const n of this.numbers) {
      const k = 1 - n.t / n.life;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.font = n.crit
        ? '800 20px ui-rounded, -apple-system, system-ui, sans-serif'
        : '700 14px ui-rounded, -apple-system, system-ui, sans-serif';
      g.fillStyle = n.color;
      g.shadowBlur = 8; g.shadowColor = 'rgba(0,0,0,0.9)';
      g.fillText(n.crit ? n.text + '!' : n.text, n.x, n.y);
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  _drawBanner(g) {
    if (!this.banner) return;
    const b = this.banner;
    const k = b.t < 300 ? b.t / 300 : b.t > 1700 ? 1 - (b.t - 1700) / 500 : 1;
    g.globalAlpha = clamp(k, 0, 1);
    g.textAlign = 'center';
    g.font = '800 22px ui-rounded, -apple-system, system-ui, sans-serif';
    g.fillStyle = b.good ? '#8affc1' : b.boss ? '#ff5b8a' : '#ffffff';
    g.shadowBlur = 16; g.shadowColor = 'rgba(0,0,0,0.9)';
    g.fillText(b.text, this.W / 2, this.H * 0.30);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
}
