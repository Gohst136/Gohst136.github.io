/* Ton. Alles wird zur Laufzeit synthetisiert — keine Dateien, kein Ladebalken.

   iOS lässt Ton erst nach einer echten Berührung zu, deshalb wird der
   AudioContext beim ersten Antippen erzeugt. Wer keinen Ton mag, schaltet ihn
   in der Arena oben rechts ab; die Einstellung wandert in den Spielstand. */

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
let ready = false;

const now = () => (ctx ? ctx.currentTime : 0);

export function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ready = true;
  } catch (_) { ctx = null; }
}

/* Beim ersten Antippen aufwecken — Safari verlangt das. */
export function armOnFirstGesture() {
  const go = () => {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('touchend', go);
  };
  window.addEventListener('pointerdown', go, { once: true });
  window.addEventListener('touchend', go, { once: true });
}

export function setEnabled(v) {
  enabled = !!v;
  if (enabled) { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
}
export const isEnabled = () => enabled;

const live = () => enabled && ready && ctx && ctx.state === 'running';

/* ---------------- Bausteine ---------------- */

function tone(type, f0, f1, dur, gain = 0.5, delay = 0, detune = 0) {
  if (!live()) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, gain = 0.4, f0 = 2400, f1 = 300, q = 1, delay = 0) {
  if (!live()) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = 'bandpass';
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/* ---------------- Klänge ---------------- */

let lastShot = 0, lastHit = 0, lastKill = 0;

export const sfx = {
  shoot(kind) {
    const t = performance.now();
    if (t - lastShot < 55) return;
    lastShot = t;
    switch (kind) {
      case 'bolt':  tone('sawtooth', 880, 180, 0.09, 0.22); noise(0.05, 0.10, 3000, 900, 3); break;
      case 'beam':  tone('sine', 720, 900, 0.14, 0.18); tone('sine', 1080, 1320, 0.12, 0.07); break;
      case 'shard': tone('square', 200, 70, 0.13, 0.20); break;
      case 'blade': noise(0.07, 0.16, 4200, 1200, 4); break;
      case 'wisp':  tone('sine', 320, 560, 0.16, 0.16); break;
      case 'rune':  tone('triangle', 660, 660, 0.10, 0.14); tone('triangle', 990, 990, 0.10, 0.08, 0.04); break;
      default:      tone('triangle', 460, 200, 0.09, 0.20);
    }
  },
  hit() {
    const t = performance.now();
    if (t - lastHit < 45) return;
    lastHit = t;
    noise(0.045, 0.12, 1800, 600, 2);
  },
  kill(big) {
    const t = performance.now();
    if (t - lastKill < 70) return;
    lastKill = t;
    noise(big ? 0.4 : 0.14, big ? 0.42 : 0.20, big ? 900 : 1600, big ? 80 : 220, 1);
    if (big) tone('sine', 160, 45, 0.5, 0.3);
  },
  boss() {
    tone('sine', 130, 55, 0.9, 0.42);
    tone('sawtooth', 88, 44, 0.7, 0.14);
    noise(0.7, 0.22, 500, 90, 0.7);
  },
  focus() {
    [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.22, 0.20, i * 0.05));
    noise(0.5, 0.14, 3000, 400, 1);
  },
  fuse() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.26, 0.20, i * 0.07));
  },
  discover() {
    [784, 1046, 1318, 1568].forEach((f, i) => {
      tone('sine', f, f, 0.55, 0.20, i * 0.085);
      tone('sine', f * 2, f * 2, 0.35, 0.06, i * 0.085);
    });
  },
  wave() { tone('triangle', 660, 880, 0.14, 0.16); tone('triangle', 880, 1100, 0.14, 0.10, 0.08); },
  defeat() { tone('sawtooth', 320, 60, 0.8, 0.28); noise(0.6, 0.18, 800, 60, 0.8); },
  coreHit() { tone('square', 150, 60, 0.14, 0.24); noise(0.1, 0.16, 700, 120, 1); },
  ui() { tone('triangle', 720, 720, 0.035, 0.12); },
  buy() { tone('triangle', 520, 780, 0.09, 0.16); },
  error() { tone('square', 220, 160, 0.12, 0.14); }
};
