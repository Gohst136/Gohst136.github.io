// Verdrahtung: Eingabe, Schleife, Bildschirmwechsel.

import { Game, DEATH } from './game.js';
import { UI } from './ui.js';
import * as store from './state.js';
import { skinById } from './skins.js';
import * as audio from './audio.js';
import { clamp } from './util.js';

const canvas = document.getElementById('view');
const data = store.load();

let mode = 'menu';           // menu | playing | paused | over
let skin = skinById(data.skin);

const input = { dir: 0, targetX: null };
const keys = new Set();
let tiltDir = 0;

const game = new Game(canvas, {
  onSector: (idx, def, first) => { if (!first) ui.banner(idx, def); },
  onGameOver: (reason, run) => {
    const result = store.finishRun(run);
    mode = 'over';
    ui.gameOver(DEATH[reason] || DEATH.fall, run, result);
    ui.refresh();
  },
});

const ui = new UI({
  onPlay: () => startRun(),
  onRestart: () => startRun(),
  onResume: () => resume(),
  onPause: () => pause(),
  onQuit: () => toMenu(),
  onSelectSkin: (s) => { skin = s; },
  onSetting: (key, value) => applySetting(key, value),
});

// ------------------------------------------------------------ Einstellungen

function applySetting(key, value) {
  if (key === 'sfx') audio.setSfx(value);
  if (key === 'music') audio.setMusic(value);
  if (key === 'shake') game.settings.shake = value;
  if (key === 'trail') game.settings.trail = value;
  if (key === 'control') { input.targetX = null; input.dir = 0; }
}

function controlMode() {
  const c = store.get().settings.control;
  if (c !== 'auto') return c;
  return matchMedia('(pointer: coarse)').matches ? 'drag' : 'keys';
}

// ------------------------------------------------------------------ Ablauf

function startRun() {
  audio.unlock();
  if (store.get().settings.music) audio.startMusic();
  skin = skinById(store.get().skin);
  input.dir = 0; input.targetX = null;
  game.settings.shake = store.get().settings.shake;
  game.settings.trail = store.get().settings.trail;
  game.start(skin, game.settings);
  mode = 'playing';
  ui.hideAll();
  if (!store.get().seenIntro) {
    store.get().seenIntro = true;
    store.save();
    const c = controlMode();
    ui.toast(c === 'drag' ? 'Finger aufs Bild legen und ziehen · Tippen schießt'
      : c === 'tilt' ? 'Gerät kippen · Tippen schießt'
        : '← → oder A/D bewegen · Leertaste schießt');
  }
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  ui.pauseStats(game.hud());
  ui.show('pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'playing';
  ui.hideAll();
}

function toMenu() {
  mode = 'menu';
  game.state = 'idle';
  ui.show('title');
  ui.refresh();
}

// ------------------------------------------------------------------ Tasten

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'escape' || k === 'p') {
    if (mode === 'playing') pause(); else if (mode === 'paused') resume();
  }
  if (k === ' ' || k === 'arrowup' || k === 'w') {
    if (mode === 'playing') { audio.unlock(); game.shoot(game.player.x, game.player.y - 400); e.preventDefault(); }
    else if (mode === 'menu' && ui.current === 'title') startRun();
    else if (mode === 'over') startRun();
  }
  if (k === 'r' && (mode === 'playing' || mode === 'paused' || mode === 'over')) startRun();
  updateKeyDir();
});

addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); updateKeyDir(); });
addEventListener('blur', () => { keys.clear(); updateKeyDir(); if (mode === 'playing') pause(); });

function updateKeyDir() {
  let d = 0;
  if (keys.has('arrowleft') || keys.has('a')) d -= 1;
  if (keys.has('arrowright') || keys.has('d')) d += 1;
  input.dir = d;
}

// ------------------------------------------------------------------ Zeiger

let pointerId = null;
let dragged = false;
let downTime = 0;
let downX = 0, downY = 0;

function toLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  const x = (clientX - rect.left) * dpr;
  const y = (clientY - rect.top) * dpr;
  return {
    x: (x - game.offX) / game.scale,
    y: (y - game.offY) / game.scale,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'playing') return;
  canvas.setPointerCapture(e.pointerId);
  pointerId = e.pointerId;
  dragged = false;
  downTime = performance.now();
  downX = e.clientX; downY = e.clientY;
  if (controlMode() === 'drag') {
    const p = toLogical(e.clientX, e.clientY);
    input.targetX = clamp(p.x, 0, game.W);
  }
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId || mode !== 'playing') return;
  if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) dragged = true;
  if (controlMode() === 'drag') {
    const p = toLogical(e.clientX, e.clientY);
    input.targetX = clamp(p.x, 0, game.W);
  }
});

function endPointer(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  input.targetX = null;
  if (mode !== 'playing') return;
  const quick = performance.now() - downTime < 260;
  if (!dragged && quick) {
    const p = toLogical(e.clientX, e.clientY);
    game.shoot(p.x, p.y + game.camY);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === pointerId) { pointerId = null; input.targetX = null; } });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- Neigung

addEventListener('deviceorientation', (e) => {
  if (e.gamma === null || e.gamma === undefined) return;
  const g = clamp(e.gamma / 20, -1, 1);
  tiltDir = Math.abs(g) < 0.08 ? 0 : g;
});

// ------------------------------------------------------------------ Fenster

let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 80);
});
addEventListener('orientationchange', () => setTimeout(() => game.resize(), 220));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') pause();
});

// ------------------------------------------------------------------ Schleife

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  if (mode === 'playing' || mode === 'over') {
    const cm = controlMode();
    if (cm === 'tilt') input.dir = tiltDir;
    else if (cm === 'drag') { /* targetX steuert */ }
    else if (cm === 'keys') { input.targetX = null; }

    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      game.update(STEP, input);
      acc -= STEP;
    }
    game.draw();
    if (mode === 'playing') ui.hud(game.hud());
  } else if (mode === 'paused') {
    game.draw();
  } else {
    game.drawIdle();
  }
}

// ------------------------------------------------------------------- Start

// Für die Konsole (Fehlersuche, kleine Experimente).
window.novaLeap = { game, ui, store, Game };

applySetting('sfx', data.settings.sfx);
game.settings.shake = data.settings.shake;
game.settings.trail = data.settings.trail;
ui.show('title');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline ist optional */ });
  });
}
