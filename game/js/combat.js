/* Die Arena: ein vertikaler Auto-Battler.
   Dein Kern steht unten, die Wellen kommen von oben. Jede ausgerüstete
   Fähigkeit feuert auf ihrer eigenen Abklingzeit — sichtbar unterschiedlich,
   je nachdem, aus welchen Elementen sie besteht. */

import {
  ENEMY_TYPES, BOSS_NAMES, bossHpMult, AFFIXES, affixChance,
  enemyHp, enemyDamage, enemyCount, essencePerKill, waveBonus, isBossWave
} from './data.js';
import { clamp, TAU, withAlpha, lighten, darken, rng, fmt } from './util.js';
import { sfx } from './audio.js';



/* Jede Fünferstaffel bekommt einen eigenen Himmel — man sieht am Hintergrund,
   wie weit man ist. */
const ZONES = [
  { a: '#07030f', b: '#160929', haze: '#7b3bff' },
  { a: '#04100f', b: '#07222a', haze: '#1fbfa8' },
  { a: '#0e040e', b: '#24071c', haze: '#ff2d78' },
  { a: '#0c0703', b: '#160f06', haze: '#ffa53a' },
  { a: '#04060f', b: '#091428', haze: '#3a7bff' },
  { a: '#090310', b: '#1a0528', haze: '#a03aff' }
];
const zoneOf = (w) => ZONES[Math.floor((Math.max(1, w) - 1) / 5) % ZONES.length];

export class Arena {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks;
    this.dpr = 1;
    this.W = 360; this.H = 640;

    this.enemies = [];
    this.shots = [];
    this.flashes = [];
    this.parts = [];
    this.numbers = [];

    this.running = false;
    this.last = 0;
    this.fps = 60;
    this._frames = 0;
    this._fpsT = 0;
    this.shake = 0;
    this.time = 0;
    this.banner = null;
    this.hurt = 0;                      /* roter Rand beim Kerntreffer */

    this.core = { hp: 100, max: 100, x: 0, y: 0, r: 26, hitT: 0, recoil: 0 };
    this.focus = 0; this.focusActive = 0;
    this.cooldowns = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveState = 'idle';            /* idle | fighting | cleared | dead */
    this.clearedTimer = 0;
    this.wave = 1;
    this.waveUnits = 0;
    this.waveDone = 0;
    this.killsThisWave = 0;
    this.repeatWave = false;
    this.stars = null;
    this.backdrop = null;
    this.backdropZone = null;
    this.zone = ZONES[0];
    this.sprites = new Map();

    this._loop = this._loop.bind(this);
    canvas.addEventListener('pointerdown', () => this.tryFocus(), { passive: true });
  }

  /* Alle Regler der gewählten Darstellungsqualität an einem Ort. */
  get q() {
    return (this.hooks.getQuality && this.hooks.getQuality()) || {
      dpr: 2, particles: 240, stars: true, rings: 26, numbers: 24,
      shake: 1, trail: 12, glow: true, burstMul: 1
    };
  }

  /* ---------------- Aufbau ---------------- */

  resize() {
    const rect = this.cv.getBoundingClientRect();
    /* Auf einem versteckten Bildschirm hat das Feld keine Größe — dann
       merken und beim nächsten Start nachholen. Sonst greift eine im Kern
       geänderte Darstellungsstufe erst viel später. */
    if (!rect.width || !rect.height) { this._needResize = true; return; }
    this._needResize = false;
    this.dpr = Math.min(this.q.dpr, window.devicePixelRatio || 1);
    this.W = Math.round(rect.width);
    this.H = Math.round(rect.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.core.x = this.W / 2;
    this.core.y = this.H - 78;
    this.sprites.clear();
    this._buildStars();
    this.backdrop = null;
  }

  /* Eine wandernde Sternenlage; die feinen Punkte sind fest in den
     Hintergrund gebacken. So bleibt es bei wenigen Vollbild-Zeichnungen
     pro Bild — auf dem Handy macht das den Unterschied. */
  _buildStars() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    const r = rng(9007);
    for (let i = 0; i < Math.round(this.W * this.H / 8000); i++) {
      const x = r() * this.W, y = r() * this.H, s = r() * 1.9 + 0.35;
      g.fillStyle = `rgba(210,215,255,${0.12 + r() * 0.5})`;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
    this.stars = c;
  }

  _buildBackdrop() {
    const z = this.zone, W = this.W, H = this.H;
    const c = document.createElement('canvas');
    c.width = Math.round(W * this.dpr); c.height = Math.round(H * this.dpr);
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, z.a);
    bg.addColorStop(0.72, z.b);
    bg.addColorStop(1, darken(z.b, 0.35));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const haze = g.createRadialGradient(W * 0.5, H * 0.10, 10, W * 0.5, H * 0.10, H * 0.55);
    haze.addColorStop(0, withAlpha(z.haze, 0.11));
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);

    /* Feine, stehende Sterne */
    const r = rng(4201);
    for (let i = 0; i < Math.round(W * H / 4200); i++) {
      const x = r() * W, y = r() * H, s = r() * 1.1 + 0.3;
      g.fillStyle = `rgba(210,215,255,${(0.08 + r() * 0.4)})`;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }

    /* Bodenlinie */
    const lineY = this.core.y - this.core.r - 6;
    const lg = g.createLinearGradient(0, lineY - 6, 0, lineY + 6);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, lineY - 6, W, 12);

    this.backdrop = c;
    this.backdropZone = z;
  }

  start() {
    if (this._needResize) this.resize();
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

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
    this.zone = zoneOf(wave);
    this.waveState = 'fighting';
    this.spawnQueue = [];
    this.killsThisWave = 0;
    this.waveDone = 0;
    this.repeatWave = false;

    const boss = isBossWave(wave);
    const n = boss ? Math.max(3, Math.round(enemyCount(wave) * 0.5)) : enemyCount(wave);
    const pool = ENEMY_TYPES.filter(t => t.from <= wave);
    const r = rng(wave * 7919 + 13);
    const chance = affixChance(wave);
    const affixPool = Object.entries(AFFIXES).filter(([, a]) => a.from <= wave);

    for (let i = 0; i < n; i++) {
      const t = pool[Math.floor(r() * pool.length)];
      let affix = null;
      if (affixPool.length && r() < chance) {
        const total = affixPool.reduce((s, [, a]) => s + a.weight, 0);
        let roll = r() * total;
        for (const [key, a] of affixPool) { roll -= a.weight; if (roll <= 0) { affix = key; break; } }
      }
      this.spawnQueue.push({ type: t, affix, delay: i * (boss ? 560 : 420) + r() * 240 });
    }
    if (boss) this.spawnQueue.push({ type: ENEMY_TYPES[ENEMY_TYPES.length - 1], delay: 900, boss: true });

    this.waveUnits = this.spawnQueue.length;
    this.spawnTimer = 0;
    this.cooldowns = this.hooks.getDeck().map(a => (a ? a.stats.cd * 0.35 : 0));
    this.banner = {
      text: boss ? `${BOSS_NAMES[(wave / 5 - 1) % BOSS_NAMES.length]}` : `WELLE ${wave}`,
      sub: boss ? `WELLE ${wave} · BOSS` : null,
      t: 0, boss
    };
    if (boss) sfx.boss();
  }

  /* ---------------- Eingabe ---------------- */

  tryFocus() {
    if (this.focus < 1 || this.focusActive > 0 || this.waveState === 'dead') return false;
    this.focus = 0;
    this.focusActive = 5000;
    this.shake = Math.max(this.shake, 14);
    this._ring(this.core.x, this.core.y, 40, this.W, '#ffffff', 520);
    sfx.focus();
    return true;
  }

  /* ---------------- Schleife ---------------- */

  _loop(now) {
    if (!this.running) return;
    let dt = now - this.last;
    this.last = now;
    /* rAF-Zeitstempel können vor performance.now() liegen -> nie negativ rechnen. */
    if (dt < 0) dt = 0;
    if (dt > 90) dt = 90;
    this.time += dt;

    /* Laufende Bildrate — für die Anzeige und die automatische Absenkung. */
    this._frames++;
    this._fpsT += dt;
    if (this._fpsT >= 700) {
      this.fps = this._frames / (this._fpsT / 1000);
      this._frames = 0; this._fpsT = 0;
    }

    this._update(dt);
    this._render();
    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    const core = this.hooks.getCore();
    const deck = this.hooks.getDeck();

    if (this.focusActive > 0) this.focusActive = Math.max(0, this.focusActive - dt);
    if (this.core.hp > 0 && this.core.hp < this.core.max) {
      this.core.hp = Math.min(this.core.max, this.core.hp + core.regen * dt / 1000);
    }
    if (this.core.hitT > 0) this.core.hitT -= dt;
    if (this.core.recoil > 0) this.core.recoil = Math.max(0, this.core.recoil - dt * 0.006);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 0.0018);

    if (this.waveState === 'fighting') {
      this.spawnTimer += dt;
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (this.spawnTimer >= this.spawnQueue[i].delay) {
          this._spawn(this.spawnQueue[i]);
          this.spawnQueue.splice(i, 1);
        }
      }
      const haste = this.focusActive > 0 ? 0.42 : 1;
      for (let i = 0; i < deck.length; i++) {
        const a = deck[i];
        if (!a) continue;
        this.cooldowns[i] = (this.cooldowns[i] ?? 0) - dt;
        if (this.cooldowns[i] <= 0 && this.enemies.length) {
          this.cooldowns[i] = a.stats.cd * haste;
          this._fire(a);
          /* Zeitrunen können den Takt sofort zurücksetzen. */
          if (a.stats.haste > 0 && Math.random() < a.stats.haste) {
            this.cooldowns[i] = 60;
            this._ring(this.core.x, this.core.y - 20, 8, 46, '#ffe9a8', 260);
          }
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
          this.banner = { text: 'ZU STARK', sub: 'AB IN DIE SCHMIEDE', t: 0, boss: true };
        } else {
          this.repeatWave = false;
          const bonus = Math.round(waveBonus(this.wave) * core.greed);
          this.hooks.onEssence(bonus, 'wave');
          this.banner = { text: `WELLE ${this.wave} GESCHAFFT`, sub: `+${fmt(bonus)} ✦`, t: 0, good: true };
          this._burst(this.core.x, this.core.y - 20, '#7dffb0', 26);
          sfx.wave();
          this.hooks.onWaveCleared(this.wave);
        }
      }
    } else if (this.waveState === 'cleared') {
      this.clearedTimer += dt;
      if (this.clearedTimer > 1300) this.beginWave(this.repeatWave ? this.wave : this.wave + 1);
    }

    this._updateEnemies(dt);
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
    const affix = entry.affix || null;
    const A = affix ? AFFIXES[affix] : null;

    let hp = boss ? enemyHp(this.wave) * bossHpMult(this.wave) : enemyHp(this.wave) * t.hp;
    let speedMult = 1;
    if (affix === 'zaeh') { hp *= 2; speedMult = 0.7; }
    if (affix === 'flink') speedMult = 1.6;

    const radius = t.r * (boss ? 2.1 : 1) * (this.W < 380 ? 0.92 : 1) * (entry.small ? 0.62 : 1);
    this.enemies.push({
      x: boss ? this.W / 2 : (entry.x ?? (22 + Math.random() * (this.W - 44))),
      y: entry.y ?? (-40 - Math.random() * 60),
      vx: (Math.random() - 0.5) * 14,
      hp: entry.small ? hp * 0.3 : hp,
      max: entry.small ? hp * 0.3 : hp,
      type: t, boss, affix, affixColor: A ? A.color : null,
      radius,
      /* Tempo relativ zur Arenahöhe: auf jedem Gerät gleich viel Reaktionszeit. */
      speed: (this.H / 14) * (1 + this.wave * 0.012) * t.speed * speedMult * (boss ? 0.55 : 1),
      dmg: enemyDamage(this.wave) * t.dmg * (boss ? 2.4 : 1) * (entry.small ? 0.4 : 1),
      rot: Math.random() * TAU,
      burn: 0, burnT: 0, slowT: 0, slowF: 1, hitT: 0,
      frozenT: 0, poison: 0, poisonT: 0, poisonStacks: 0,
      small: !!entry.small,
      name: boss ? BOSS_NAMES[(this.wave / 5 - 1) % BOSS_NAMES.length] : t.name
    });
  }

  _updateEnemies(dt) {
    const s = dt / 1000;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      /* Beim Tod des Kerns wird die Liste mitten in der Schleife geleert. */
      if (!e) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      if (e.frozenT > 0) e.frozenT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        this._damage(e, e.burn * s, { silent: true, dot: true });
        if (Math.random() < 0.25) {
          this._particle(e.x + (Math.random() - 0.5) * e.radius, e.y,
                         -30 - Math.random() * 40, (Math.random() - 0.5) * 30, '#ff9d2f', 420, 2);
        }
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        this._damage(e, e.poison * s, { silent: true, dot: true });
        if (Math.random() < 0.22) {
          this._particle(e.x + (Math.random() - 0.5) * e.radius, e.y + e.radius * 0.4,
                         (Math.random() - 0.5) * 20, -18, '#b6ff3a', 520, 1.8);
        }
        if (e.poisonT <= 0) { e.poison = 0; e.poisonStacks = 0; }
      }
      if (e.hitT > 0) e.hitT -= dt;
      if (e.hp <= 0) continue;

      /* Eingefrorene Gegner stehen einfach still. */
      if (e.frozenT > 0) {
        if (Math.random() < 0.12) {
          this._particle(e.x + (Math.random() - 0.5) * e.radius * 1.4, e.y,
                         0, -14, '#dff6ff', 380, 1.4);
        }
        continue;
      }

      e.y += e.speed * e.slowF * s;
      e.x += e.vx * s;
      if (e.x < e.radius) { e.x = e.radius; e.vx *= -1; }
      if (e.x > this.W - e.radius) { e.x = this.W - e.radius; e.vx *= -1; }
      e.rot += s * (e.boss ? 0.4 : 0.9) * (e.affix === 'flink' ? 2 : 1);

      if (e.affix === 'flink' && Math.random() < 0.3) {
        this._particle(e.x, e.y - e.radius * 0.5, 0, -40, e.affixColor, 260, 1.6);
      }

      if (e.y > this.core.y - this.core.r - e.radius * 0.6) {
        this._hitCore(e.dmg);
        this._burst(e.x, e.y, e.type.color, 16);
        this.waveDone++;
        if (this.waveState === 'dead') break;
        this.enemies.splice(i, 1);
      }
    }
  }

  _hitCore(dmg) {
    this.core.hp -= dmg;
    this.core.hitT = 260;
    this.hurt = 1;
    this.shake = Math.max(this.shake, 10);
    sfx.coreHit();
    if (this.core.hp <= 0) {
      this.core.hp = 0;
      this.waveState = 'dead';
      this.shake = 22;
      this._burst(this.core.x, this.core.y, '#ff5b8a', 60);
      this.enemies.length = 0;
      this.shots.length = 0;
      this.spawnQueue.length = 0;
      sfx.defeat();
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
    const core = this.hooks.getCore();
    const boost = (this.focusActive > 0 ? 1.6 : 1) * (core.dmgMult || 1);
    const targets = this._targets(st.count);
    if (!targets.length) return;

    if (!isEcho) {
      sfx.shoot(a.shot);
      this.core.recoil = 1;
      this.flashes.push({
        kind: 'muzzle', x: this.core.x, y: this.core.y - 22,
        color: a.colors.glow, t: 0, life: 180, r: 10 + st.count * 3
      });
    }

    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      const dmg = st.dmg * boost * (isEcho ? 0.7 : 1);
      const spread = (i - (targets.length - 1) / 2) * 12;

      if (a.shot === 'bolt' || a.shot === 'beam') {
        const pierce = a.shot === 'beam' ? st.pierce + 1 : 0;
        this.flashes.push({
          kind: a.shot, x1: this.core.x + spread, y1: this.core.y - 20,
          x2: tgt.x, y2: tgt.y, color: a.colors.glow, t: 0,
          life: a.shot === 'beam' ? 220 : 160,
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
      if (p.kind === 'rune') { p.spin += s * 8; p.x += Math.cos(p.spin) * 60 * s; }
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.spin += s * 6;

      if (this.q.trail > 0) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > this.q.trail) p.trail.splice(0, 2);
      }

      if (p.y < -60 || p.x < -60 || p.x > this.W + 60 || p.y > this.H + 60) {
        this.shots.splice(i, 1); continue;
      }

      for (const e of this.enemies) {
        if (e.hp <= 0 || p.hits.includes(e)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + p.r) {
          p.hits.push(e);
          this._impact(p.a, e, p.dmg);
          if (p.hits.length > p.pierce) this.shots.splice(i, 1);
          break;
        }
      }
    }
  }

  /* Treffer inkl. aller Elementeffekte. */
  _impact(a, enemy, dmg) {
    const st = a.stats;
    const crit = Math.random() < st.crit;
    const total = dmg * (crit ? st.critMult : 1) * (enemy.boss ? st.bossDmg : 1);
    this._damage(enemy, total, { crit, color: a.colors.glow, unarmor: st.unarmor });
    sfx.hit();

    const busy = this.parts.length > 150;
    this._burst(enemy.x, enemy.y, a.colors.a, busy ? 3 : (crit ? 14 : 7));
    this._ring(enemy.x, enemy.y, 4, Math.max(18, st.aoe * 0.5), a.colors.glow, 320);

    if (st.aoe > 34) {
      for (const o of this.enemies.slice()) {
        if (o === enemy || o.hp <= 0) continue;
        if (Math.hypot(o.x - enemy.x, o.y - enemy.y) < st.aoe) {
          this._damage(o, total * st.novaShare, { color: a.colors.a, unarmor: st.unarmor });
        }
      }
    }
    if (st.burn > 0.05) {
      enemy.burn = Math.max(enemy.burn, total * st.burn / 3);
      enemy.burnT = 3000;
    }
    if (st.slow > 0.05) {
      enemy.slowF = Math.min(enemy.slowF, 1 - st.slow);
      enemy.slowT = 2200;
    }
    /* Seuche stapelt sich — jeder Treffer legt noch etwas obendrauf. */
    if (st.poison > 0.05) {
      enemy.poison += total * st.poison / 5;
      enemy.poisonStacks = Math.min(99, (enemy.poisonStacks || 0) + 1);
      enemy.poisonT = 4500;
    }
    /* Starre hält ein Ziel komplett an; Bosse werden nur zäh gebremst. */
    if (st.freeze > 0.02) {
      if (!enemy.boss && Math.random() < st.freeze) {
        enemy.frozenT = Math.max(enemy.frozenT, 900);
        this._ring(enemy.x, enemy.y, enemy.radius * 0.5, enemy.radius * 2.2, '#dff6ff', 360);
      } else if (enemy.boss && Math.random() < st.freeze * 0.4) {
        enemy.slowF = Math.min(enemy.slowF, 0.35);
        enemy.slowT = 1200;
      }
    }
    /* Sterne reißen ein sichtbares Loch. */
    if (st.novaShare > 0.75) {
      this._ring(enemy.x, enemy.y, 8, st.aoe * 1.5, a.colors.glow, 520);
    }
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
    if (st.lifesteal > 0.005 && this.core.hp > 0) {
      const heal = total * st.lifesteal;
      this.core.hp = Math.min(this.core.max, this.core.hp + heal);
      this._particle(enemy.x, enemy.y, (this.core.x - enemy.x) * 0.4,
                     (this.core.y - enemy.y) * 0.4, '#b06bff', 620, 3);
    }
  }

  _damage(enemy, amount, opt = {}) {
    if (enemy.hp <= 0) return;
    if (enemy.affix === 'panzer' && !opt.unarmor) amount *= 0.6;
    enemy.hp -= amount;
    enemy.hitT = 90;
    if (!opt.silent && (this.q.numbers > 8 || opt.crit || this.numbers.length < 3)) {
      this.numbers.push({
        x: enemy.x + (Math.random() - 0.5) * 14, y: enemy.y - enemy.radius * 0.4,
        v: -34 - Math.random() * 20, t: 0, life: 720,
        text: fmt(amount), crit: !!opt.crit,
        color: opt.crit ? '#ffe066' : (opt.color || '#ffffff')
      });
      if (this.numbers.length > this.q.numbers) this.numbers.shift();
    }
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
    this._ring(enemy.x, enemy.y, enemy.radius, enemy.radius * (enemy.boss ? 7 : 3),
               enemy.type.color, enemy.boss ? 700 : 380);
    sfx.kill(enemy.boss);
    if (enemy.boss) this.shake = Math.max(this.shake, 18);

    /* Teilende Gegner hinterlassen zwei Kleine. */
    if (enemy.affix === 'teilend' && !enemy.small && !enemy.boss) {
      for (let i = 0; i < 2; i++) {
        this._spawn({
          type: enemy.type, small: true, affix: null,
          x: clamp(enemy.x + (i ? 26 : -26), 20, this.W - 20), y: enemy.y
        });
      }
      this.waveUnits += 2;
    }

    const core = this.hooks.getCore();
    const gain = essencePerKill(this.wave) * (enemy.boss ? 14 : 1) * (enemy.small ? 0.3 : 1) * core.greed;
    this.hooks.onEssence(gain, 'kill');
    this.killsThisWave++;
    this.waveDone++;
  }

  /* ---------------- Effekte ---------------- */

  _particle(x, y, vx, vy, color, life, r) {
    if (this.parts.length > this.q.particles) this.parts.shift();
    this.parts.push({ x, y, vx, vy, color, life, max: life, r: r || 2 });
  }
  _burst(x, y, color, n) {
    n = Math.max(1, Math.round(n * this.q.burstMul));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU, sp = 40 + Math.random() * 190;
      this._particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color,
                     320 + Math.random() * 380, 1 + Math.random() * 2.4);
    }
  }
  _ring(x, y, r0, r1, color, life) {
    /* Bei Massenbetrieb lieber ein paar Ringe weglassen als Bilder. */
    if (this.flashes.length > this.q.rings) return;
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
    const shake = this.shake * this.q.shake;
    if (shake > 0.4) {
      g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    /* Himmel der aktuellen Staffel — einmal gezeichnet, dann gestempelt. */
    if (!this.backdrop || this.backdropZone !== this.zone) this._buildBackdrop();
    g.drawImage(this.backdrop, 0, 0, W, H);

    /* Eine wandernde Sternenlage darüber */
    if (this.stars && this.q.stars) {
      const off = (this.time * 0.014) % H;
      g.globalAlpha = 0.7;
      g.drawImage(this.stars, 0, off);
      g.drawImage(this.stars, 0, off - H);
      g.globalAlpha = 1;
    }

    if (this.focusActive > 0) {
      g.fillStyle = `rgba(150,100,255,${0.09 + 0.05 * Math.sin(this.time / 90)})`;
      g.fillRect(0, 0, W, H);
    }

    this._drawShots(g);
    this._drawEnemies(g);
    this._drawFlashes(g);
    this._drawParticles(g);
    this._drawCore(g);
    this._drawNumbers(g);
    this._drawTop(g);
    this._drawBanner(g);

    /* Roter Rand, wenn der Kern getroffen wurde */
    if (this.hurt > 0.01 && this.q.glow) {
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62);
      v.addColorStop(0, 'rgba(255,0,60,0)');
      v.addColorStop(1, `rgba(255,20,70,${0.42 * this.hurt})`);
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }

    g.restore();
  }

  /* Gegnerkörper einmal vorzeichnen und danach nur noch stempeln — Verläufe
     und Weichzeichner pro Bild und Gegner sind auf dem Handy zu teuer. */
  _sprite(type, radius, boss, hit) {
    const key = `${type.id}|${Math.round(radius)}|${boss ? 1 : 0}|${hit ? 1 : 0}|${this.q.glow ? 1 : 0}`;
    let sp = this.sprites.get(key);
    if (sp) return sp;

    const pad = radius * 0.6 + 8;
    const size = Math.ceil((radius + pad) * 2);
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * this.dpr);
    const g = cv.getContext('2d');
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);

    const col = hit ? '#ffffff' : type.color;
    g.beginPath();
    for (let i = 0; i < type.sides; i++) {
      const ang = (i / type.sides) * TAU;
      const x = Math.cos(ang) * radius, y = Math.sin(ang) * radius;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    const grad = g.createRadialGradient(0, -radius * 0.3, 1, 0, 0, radius);
    grad.addColorStop(0, withAlpha(lighten(col, 0.55), 0.98));
    grad.addColorStop(1, withAlpha(darken(col, 0.25), boss ? 0.92 : 0.7));
    g.fillStyle = grad;
    if (this.q.glow) {
      g.shadowBlur = boss ? 26 : 12;
      g.shadowColor = withAlpha(col, 0.9);
    }
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = withAlpha(lighten(col, 0.65), 0.95);
    g.stroke();

    /* Innenzeichnung — gibt jedem Typ ein Gesicht */
    g.beginPath();
    for (let i = 0; i < type.sides; i++) {
      const ang = (i / type.sides) * TAU + Math.PI / type.sides;
      const rr = radius * 0.45;
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = withAlpha(darken(col, 0.55), 0.55);
    g.fill();
    g.strokeStyle = withAlpha('#ffffff', 0.35);
    g.lineWidth = 1;
    g.stroke();

    sp = { cv, size };
    if (this.sprites.size > 60) this.sprites.clear();
    this.sprites.set(key, sp);
    return sp;
  }

  _drawEnemies(g) {
    for (const e of this.enemies) {
      const sp = this._sprite(e.type, e.radius, e.boss, e.hitT > 0);
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.rot);
      g.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);

      /* Eingefroren: dicker Eisrahmen */
      if (e.frozenT > 0) {
        g.beginPath();
        g.arc(0, 0, e.radius * 1.3, 0, TAU);
        g.fillStyle = 'rgba(200,240,255,0.28)';
        g.fill();
        g.strokeStyle = '#dff6ff';
        g.lineWidth = 3;
        g.stroke();
      }
      /* Frost */
      if (e.slowF < 1) {
        g.beginPath();
        for (let i = 0; i < e.type.sides; i++) {
          const ang = (i / e.type.sides) * TAU;
          const x = Math.cos(ang) * e.radius, y = Math.sin(ang) * e.radius;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
        g.strokeStyle = 'rgba(120,230,255,0.9)';
        g.lineWidth = 3;
        g.stroke();
      }
      /* Panzerung als zweiter Ring */
      if (e.affix === 'panzer') {
        g.beginPath();
        g.arc(0, 0, e.radius * 1.22, 0, TAU);
        g.strokeStyle = withAlpha(e.affixColor, 0.85);
        g.lineWidth = 2.5;
        g.setLineDash([5, 4]);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();

      /* Lebensbalken */
      const w = e.radius * 2, hp = clamp(e.hp / e.max, 0, 1);
      if (!e.boss) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
        g.fillStyle = e.affix ? e.affixColor : '#8affc1';
        g.fillRect(e.x - w / 2, e.y - e.radius - 10, w * hp, 4);
      }
      if (e.poisonStacks > 0 && !e.small) {
        g.fillStyle = '#b6ff3a';
        g.font = '800 8px ui-rounded, -apple-system, system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText('☠' + e.poisonStacks, e.x + e.radius * 0.7, e.y - e.radius - 12);
      }
      if (e.affix && !e.small) {
        g.fillStyle = withAlpha(e.affixColor, 0.95);
        g.font = '800 8px ui-rounded, -apple-system, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(AFFIXES[e.affix].short, e.x, e.y - e.radius - 14);
      }
    }
  }

  _drawShots(g) {
    for (const p of this.shots) {
      const c = p.a.colors;
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
      /* Schein als zweiter, größerer Kreis — deutlich günstiger als
         shadowBlur, und bei vielen Geschossen macht das den Unterschied. */
      if (this.q.glow) {
        g.beginPath();
        g.arc(0, 0, p.r * 2.1, 0, TAU);
        g.fillStyle = withAlpha(c.glow, 0.22);
        g.fill();
      }
      g.fillStyle = withAlpha(lighten(c.glow, 0.35), 0.98);
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
        g.beginPath(); g.arc(-p.r * 0.25, -p.r * 0.25, p.r * 0.45, 0, TAU);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.fill();
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
        g.arc(f.x, f.y, Math.max(0, r), 0, TAU);
        g.strokeStyle = withAlpha(f.color, k * 0.75);
        g.lineWidth = 2 + k * 3;
        g.stroke();
      } else if (f.kind === 'muzzle') {
        const r = f.r * (1.4 - k * 0.6);
        const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, r));
        grd.addColorStop(0, withAlpha('#ffffff', k * 0.9));
        grd.addColorStop(0.5, withAlpha(f.color, k * 0.55));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(f.x, f.y, Math.max(1, r), 0, TAU);
        g.fill();
      } else if (f.kind === 'beam') {
        g.beginPath();
        g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2);
        g.strokeStyle = withAlpha(f.color, k * 0.9);
        g.lineWidth = Math.max(0.5, f.w * k);
        g.shadowBlur = 22; g.shadowColor = withAlpha(f.color, 1);
        g.lineCap = 'round';
        g.stroke();
        g.shadowBlur = 0;
      } else if (f.kind === 'bolt') {
        const r = rng(f.seed | 0);
        g.beginPath();
        g.moveTo(f.x1, f.y1);
        for (let i = 1; i < 6; i++) {
          const t = i / 6;
          g.lineTo(f.x1 + (f.x2 - f.x1) * t + (r() - 0.5) * 26,
                   f.y1 + (f.y2 - f.y1) * t + (r() - 0.5) * 14);
        }
        g.lineTo(f.x2, f.y2);
        g.strokeStyle = withAlpha(lighten(f.color, 0.45), k);
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
      g.arc(p.x, p.y, Math.max(0.2, p.r * (0.4 + k * 0.9)), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  _drawCore(g) {
    const { x, r } = this.core;
    const y = this.core.y + this.core.recoil * 5;
    const deck = this.hooks.getDeck().filter(Boolean);
    const col = deck.length ? deck[0].colors.glow : '#8a4dff';
    const pulse = 1 + Math.sin(this.time / 380) * 0.05 + (this.focusActive > 0 ? 0.12 : 0);

    /* Sockel */
    const base = g.createRadialGradient(x, y, r * 0.4, x, y, r * 3);
    base.addColorStop(0, withAlpha(col, 0.28));
    base.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = base;
    g.beginPath();
    g.arc(x, y, r * 3, 0, TAU);
    g.fill();

    g.save();
    g.translate(x, y);
    g.rotate(this.time / 4000);
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
    if (this.q.glow) { g.shadowBlur = 30; g.shadowColor = withAlpha(col, 0.95); }
    g.fill();
    g.shadowBlur = 0;
    g.restore();

    /* Schutzbogen als Lebensanzeige */
    const hp = clamp(this.core.hp / this.core.max, 0, 1);
    g.beginPath();
    g.arc(x, y, r + 12, Math.PI * 0.75, Math.PI * 2.25);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.stroke();
    g.beginPath();
    g.arc(x, y, r + 12, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * hp);
    g.strokeStyle = hp > 0.4 ? '#7dffb0' : '#ff5b8a';
    g.lineWidth = 4;
    g.stroke();
  }

  _drawNumbers(g) {
    g.textAlign = 'center';
    for (const n of this.numbers) {
      const k = 1 - n.t / n.life;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.font = n.crit
        ? '900 21px ui-rounded, -apple-system, system-ui, sans-serif'
        : '700 14px ui-rounded, -apple-system, system-ui, sans-serif';
      g.fillStyle = n.color;
      g.shadowBlur = 8; g.shadowColor = 'rgba(0,0,0,0.9)';
      g.fillText(n.crit ? n.text + '!' : n.text, n.x, n.y);
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  /* Kopfzeile in der Arena: Wellenfortschritt und Bossleiste. */
  _drawTop(g) {
    const W = this.W;
    const boss = this.enemies.find(e => e.boss);
    const pad = 10;

    /* Abdunkeln, damit Text und Leisten über allem lesbar bleiben. */
    const shade = g.createLinearGradient(0, 0, 0, 56);
    shade.addColorStop(0, 'rgba(4,1,10,0.75)');
    shade.addColorStop(1, 'rgba(4,1,10,0)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, 56);

    if (boss) {
      const hp = clamp(boss.hp / boss.max, 0, 1);
      const w = W - pad * 2 - 42, h = 9, y = pad + 14;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(pad, y, w, h);
      const grd = g.createLinearGradient(pad, 0, pad + w, 0);
      grd.addColorStop(0, '#ff2d55');
      grd.addColorStop(1, '#ff8ae2');
      g.fillStyle = grd;
      g.fillRect(pad, y, w * hp, h);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.strokeRect(pad + 0.5, y + 0.5, w - 1, h - 1);
      g.fillStyle = '#fff';
      g.font = '800 11px ui-rounded, -apple-system, system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText(boss.name.toUpperCase(), pad, y - 5);
      g.textAlign = 'right';
      g.fillText(Math.round(hp * 100) + ' %', pad + w, y - 5);
      return;
    }

    /* Wellenfortschritt */
    const total = Math.max(1, this.waveUnits);
    const done = clamp(this.waveDone / total, 0, 1);
    const w = W - pad * 2 - 42, h = 4, y = pad + 4;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(pad, y, w, h);
    g.fillStyle = withAlpha('#7dffb0', 0.85);
    g.fillRect(pad, y, w * done, h);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '700 10px ui-rounded, -apple-system, system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(`WELLE ${this.wave}`, pad, y + 16);
    g.textAlign = 'right';
    g.fillText(`${Math.min(this.waveDone, total)} / ${total}`, pad + w, y + 16);
  }

  _drawBanner(g) {
    if (!this.banner) return;
    const b = this.banner;
    const k = b.t < 300 ? b.t / 300 : b.t > 1700 ? 1 - (b.t - 1700) / 500 : 1;
    g.globalAlpha = clamp(k, 0, 1);
    g.textAlign = 'center';
    const y = this.H * 0.30;
    g.font = '900 24px ui-rounded, -apple-system, system-ui, sans-serif';
    g.fillStyle = b.good ? '#8affc1' : b.boss ? '#ff5b8a' : '#ffffff';
    g.shadowBlur = 16; g.shadowColor = 'rgba(0,0,0,0.9)';
    g.fillText(b.text, this.W / 2, y);
    if (b.sub) {
      g.font = '800 13px ui-rounded, -apple-system, system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(b.sub, this.W / 2, y + 22);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
}
