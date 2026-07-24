/* Wellen im Hintergrund.

   Die Arena rechnet nur, solange man sie ansieht. Für alles andere — anderer
   Reiter, App geschlossen, Handy im Schlaf — rechnet dieses Modul dieselben
   Wellen im Zeitraffer nach. Es benutzt bewusst dieselbe Wellenmathematik wie
   der Kampf, damit die Zahlen zusammenpassen und niemand das Gefühl bekommt,
   im Hintergrund benachteiligt oder bevorzugt zu werden. */

import {
  enemyHp, enemyDamage, enemyCount, essencePerKill, waveBonus, isBossWave,
  BOSS_HP_MULT, ENEMY_TYPES, TRAVEL_SECONDS, MAX_OFFLINE_SECONDS
} from './data.js';

const KOLOSS = ENEMY_TYPES[ENEMY_TYPES.length - 1];

/* Was in einer einzelnen Welle passiert. */
function wave(w, dps, ctx) {
  const boss = isBossWave(w);
  const n = boss ? Math.max(3, Math.round(enemyCount(w) * 0.5)) : enemyCount(w);
  const hpEach = enemyHp(w);
  const totalHp = n * hpEach + (boss ? hpEach * BOSS_HP_MULT * KOLOSS.hp : 0);
  const units = n + (boss ? 1 : 0);

  const spawnSpan = n * (boss ? 0.56 : 0.42);
  /* So viel Schaden bekommt man unter, bevor die Reihe den Kern erreicht. */
  const window = TRAVEL_SECONDS + spawnSpan;
  const killedShare = Math.max(0, Math.min(1, (dps * window) / Math.max(1, totalHp)));
  const killed = Math.floor(units * killedShare + 1e-9);
  const leaked = units - killed;

  const duration = Math.max(totalHp * killedShare / Math.max(1, dps), spawnSpan + 2) + 1.3;
  const damage = leaked * enemyDamage(w) * (boss ? 1.4 : 1);

  /* Der Boss zählt wie 14 gewöhnliche Gegner — genau wie in der Arena. */
  const bossDown = boss && killed >= units;
  const essence =
    killed * essencePerKill(w) +
    (bossDown ? essencePerKill(w) * 13 : 0) +
    (killed >= units ? waveBonus(w) : 0);

  return { killed, leaked, duration, damage, essence, cleared: killed >= units, units };
}

/* Rechnet `seconds` Spielzeit nach.
   ctx: { dps, wave, hp, maxHp, regen, greed }
   Gibt zurück, was sich verändert hat — der Aufrufer schreibt es in den
   Spielstand. */
export function simulate(seconds, ctx) {
  const cap = Math.min(seconds, MAX_OFFLINE_SECONDS);
  let t = 0;
  let w = ctx.wave;
  let hp = ctx.hp;
  const out = { essence: 0, kills: 0, waves: 0, deaths: 0, wave: w, seconds: cap, stalled: false };
  if (cap <= 0 || ctx.dps <= 0) { out.hp = hp; return out; }

  let guard = 0;
  while (t < cap && guard++ < 12000) {
    const r = wave(w, ctx.dps, ctx);
    /* Nur der Teil der Welle, der in die verbleibende Zeit passt. */
    const share = Math.min(1, (cap - t) / r.duration);
    t += r.duration * share;

    out.essence += r.essence * share * ctx.greed;
    out.kills += r.killed * share;

    if (share < 1) break;                      /* Welle nur angefangen */

    hp = Math.min(ctx.maxHp, hp + ctx.regen * r.duration) - r.damage;
    if (hp <= 0) {
      out.deaths++;
      hp = ctx.maxHp;
      w = Math.max(1, w - ((w - 1) % 5));       /* zurück an den Blockanfang */
      out.stalled = true;
      t += 1.5;
      continue;
    }
    if (r.killed >= 1) { w++; out.waves++; }
    else out.stalled = true;                   /* nichts besiegt: Welle bleibt */
  }

  out.wave = w;
  out.hp = hp;
  return out;
}

/* Grobe Vorschau für die Anzeige: wie viel Essenz pro Minute bringt der
   aktuelle Stand? */
export function essencePerMinute(ctx) {
  const r = simulate(60, ctx);
  return r.essence;
}
