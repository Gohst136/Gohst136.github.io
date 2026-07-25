// Kleiner Synthesizer. Keine Audiodateien — alles wird zur Laufzeit erzeugt.

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicNodes = [];
let musicOn = true;
let sfxOn = true;
let started = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxOn ? 0.55 : 0;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  started = true;
}

export function setSfx(on) {
  sfxOn = on;
  if (sfxGain) sfxGain.gain.value = on ? 0.55 : 0;
}

export function setMusic(on) {
  musicOn = on;
  if (!ctx) return;
  if (on) startMusic(); else stopMusic();
}

function env(node, t0, a, d, peak = 1) {
  node.gain.cancelScheduledValues(t0);
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, attack = 0.005, gain = 0.4, detune = 0, dest = null }) {
  const c = ensure();
  if (!c || !sfxOn) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  env(g, t0, attack, dur, gain);
  osc.connect(g);
  g.connect(dest || sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + attack + 0.05);
}

function noise({ dur = 0.2, gain = 0.3, f0 = 1800, f1 = 300, q = 1, type = 'bandpass' }) {
  const c = ensure();
  if (!c || !sfxOn) return;
  const t0 = c.currentTime;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t0 + dur);
  const g = c.createGain();
  env(g, t0, 0.004, dur, gain);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  jump: () => tone({ type: 'triangle', f0: 300, f1: 620, dur: 0.13, gain: 0.32 }),
  jumpBig: () => { tone({ type: 'sawtooth', f0: 220, f1: 900, dur: 0.3, gain: 0.28 }); noise({ dur: 0.3, f0: 900, f1: 200, gain: 0.18 }); },
  boost: () => { tone({ type: 'square', f0: 180, f1: 1200, dur: 0.45, gain: 0.22 }); noise({ dur: 0.5, f0: 400, f1: 2400, gain: 0.14, type: 'highpass' }); },
  coin: () => { tone({ type: 'square', f0: 880, dur: 0.07, gain: 0.2 }); setTimeout(() => tone({ type: 'square', f0: 1320, dur: 0.11, gain: 0.18 }), 55); },
  oxygen: () => { tone({ type: 'sine', f0: 520, f1: 1040, dur: 0.25, gain: 0.26 }); },
  shoot: () => { tone({ type: 'sawtooth', f0: 900, f1: 240, dur: 0.11, gain: 0.14 }); },
  hit: () => { noise({ dur: 0.18, f0: 2200, f1: 400, gain: 0.3 }); tone({ type: 'square', f0: 160, f1: 60, dur: 0.2, gain: 0.2 }); },
  crumble: () => noise({ dur: 0.22, f0: 1400, f1: 260, gain: 0.2, q: 0.7 }),
  phase: () => tone({ type: 'sine', f0: 700, f1: 1400, dur: 0.14, gain: 0.12 }),
  portal: () => { tone({ type: 'sine', f0: 400, f1: 1600, dur: 0.22, gain: 0.2 }); tone({ type: 'sine', f0: 1600, f1: 400, dur: 0.22, gain: 0.14, detune: 12 }); },
  shield: () => tone({ type: 'triangle', f0: 300, f1: 760, dur: 0.35, gain: 0.24 }),
  magnet: () => { tone({ type: 'sine', f0: 300, f1: 900, dur: 0.3, gain: 0.18 }); },
  death: () => { tone({ type: 'sawtooth', f0: 420, f1: 44, dur: 1.1, gain: 0.3 }); noise({ dur: 0.9, f0: 900, f1: 60, gain: 0.22, type: 'lowpass' }); },
  sector: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', f0: f, dur: 0.32, gain: 0.16 }), i * 90)); },
  ui: () => tone({ type: 'sine', f0: 660, dur: 0.06, gain: 0.14 }),
  buy: () => { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone({ type: 'square', f0: f, dur: 0.16, gain: 0.13 }), i * 70)); },
  deny: () => tone({ type: 'square', f0: 180, f1: 120, dur: 0.16, gain: 0.16 }),
  record: () => { [659, 784, 988, 1319, 1568].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', f0: f, dur: 0.4, gain: 0.18 }), i * 110)); },
};

// --- Hintergrundklang: langsam wandernder Akkord, dazu ein leises Pulsen. ---
const CHORDS = [
  [55, 82.4, 110, 164.8],
  [61.7, 92.5, 123.5, 185],
  [49, 73.4, 98, 146.8],
  [65.4, 98, 130.8, 196],
];

export function startMusic() {
  const c = ensure();
  if (!c || !musicOn || musicNodes.length) return;
  const t0 = c.currentTime;
  musicGain.gain.cancelScheduledValues(t0);
  musicGain.gain.setValueAtTime(0.0001, t0);
  musicGain.gain.linearRampToValueAtTime(0.16, t0 + 3);

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 700;
  filt.Q.value = 1.4;
  filt.connect(musicGain);

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 380;
  lfo.connect(lfoGain);
  lfoGain.connect(filt.frequency);
  lfo.start();
  musicNodes.push(lfo);

  let chordIndex = 0;
  const voices = [];
  for (let i = 0; i < 4; i++) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = i % 2 ? 'sawtooth' : 'triangle';
    osc.detune.value = (i - 1.5) * 7;
    g.gain.value = 0.13;
    osc.connect(g); g.connect(filt);
    osc.start();
    voices.push(osc);
    musicNodes.push(osc);
  }

  const step = () => {
    if (!musicNodes.length) return;
    const now = c.currentTime;
    const chord = CHORDS[chordIndex % CHORDS.length];
    voices.forEach((o, i) => o.frequency.setTargetAtTime(chord[i] * 2, now, 2.2));
    chordIndex++;
  };
  step();
  const timer = setInterval(step, 9000);
  musicNodes.push({ stop: () => clearInterval(timer) });
}

export function stopMusic() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t0);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
  musicGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.8);
  const dead = musicNodes;
  musicNodes = [];
  setTimeout(() => dead.forEach((n) => { try { n.stop(); } catch (e) { /* schon gestoppt */ } }), 1000);
}

export const isStarted = () => started;
