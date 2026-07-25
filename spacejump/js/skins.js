// Acht Figuren, alle prozedural gezeichnet — kein einziges Bild im Ordner.
// Jede Zeichenfunktion arbeitet in einem lokalen Raum von etwa -22..22.

import { TAU, roundRect, starPath, clamp } from './util.js';

export const SKINS = [
  {
    id: 'pionier', name: 'Pionier', shape: 'astro', cost: 0,
    tag: 'Standard',
    desc: 'Der klassische Anzug. Ausgewogen in allem, verzeiht die meisten Fehler.',
    perkText: 'Keine Sonderfähigkeit — dafür keine Schwäche.',
    pal: { main: '#eef3fb', dark: '#98a8c0', light: '#ffffff', glow: '#5ad7ff', accent: '#ff7a3d', visor: '#123', deep: '#5b6a80' },
    perk: {},
  },
  {
    id: 'rostbolzen', name: 'Rostbolzen', shape: 'robot', cost: 250,
    tag: 'Filteranlage',
    desc: 'Ein ausgemusterter Wartungsdroide. Atmet nicht, also spart er Sauerstoff.',
    perkText: 'Sauerstoff hält 18 % länger.',
    pal: { main: '#c9d2dc', dark: '#6c7787', light: '#f2f6fa', glow: '#ffcc4d', accent: '#ff8b3d', visor: '#1a2230', deep: '#3c4553' },
    perk: { o2: 0.82 },
  },
  {
    id: 'zyx', name: 'Zyx-9', shape: 'alien', cost: 600,
    tag: 'Leichtbau',
    desc: 'Kommt von einem Planeten mit halber Schwerkraft. Springt höher, driftet aber weiter.',
    perkText: 'Sprungkraft +7 %, dafür weniger Bodenhaftung in der Luft.',
    pal: { main: '#7ef0a8', dark: '#2e9a63', light: '#c8ffd9', glow: '#b6ff5c', accent: '#ff5fa8', visor: '#0b2418', deep: '#17603c' },
    perk: { jump: 1.07, drift: 1.25 },
  },
  {
    id: 'pfote', name: 'Major Pfote', shape: 'cat', cost: 900,
    tag: 'Leichte Pfoten',
    desc: 'Landet so sanft, dass Eisplatten einen Sprung länger halten.',
    perkText: 'Eisplatten zerbrechen erst beim zweiten Aufsetzen.',
    pal: { main: '#ffd9a8', dark: '#c98b4b', light: '#fff2dd', glow: '#ffd166', accent: '#ff6fae', visor: '#20140a', deep: '#8a5a2b' },
    perk: { iceTough: true },
  },
  {
    id: 'neon', name: 'Neon', shape: 'cyber', cost: 1400,
    tag: 'Überladen',
    desc: 'Halb Mensch, halb Reaktor. Die Plasmakanone lädt deutlich schneller nach.',
    perkText: 'Schussrate +45 %.',
    pal: { main: '#1b2440', dark: '#0d1224', light: '#7be7ff', glow: '#ff3df0', accent: '#3dfff0', visor: '#ff3df0', deep: '#3a2a6a' },
    perk: { fireRate: 0.55 },
  },
  {
    id: 'nebel', name: 'Nebelgeist', shape: 'ghost', cost: 2000,
    tag: 'Phasenkörper',
    desc: 'Nicht ganz da. Phasenplattformen tragen ihn auch, wenn sie verschwunden sind.',
    perkText: 'Phasenplattformen sind immer fest.',
    pal: { main: '#a9c6ff', dark: '#4a5f9e', light: '#e8f1ff', glow: '#8affff', accent: '#c99dff', visor: '#0a1030', deep: '#2b3566' },
    perk: { phaseSolid: true },
  },
  {
    id: 'sternenherz', name: 'Sternenherz', shape: 'star', cost: 2800,
    tag: 'Anziehung',
    desc: 'Ein kleiner Stern im Anzug. Münzen fliegen ihm aus großer Entfernung zu.',
    perkText: 'Münzen werden dauerhaft aus dreifacher Distanz angezogen.',
    pal: { main: '#ffd85c', dark: '#e08a1e', light: '#fff6c9', glow: '#fff08a', accent: '#ff6b4d', visor: '#3a2200', deep: '#b8620d' },
    perk: { magnet: 3 },
  },
  {
    id: 'void', name: 'Void-Kern', shape: 'void', cost: 4000,
    tag: 'Gegenfeld',
    desc: 'Trägt selbst ein Loch im Bauch. Fremde Schwerkraftfelder stoßen ihn ab, statt ihn zu ziehen.',
    perkText: 'Schwarze Löcher schleudern dich weg, statt dich zu schlucken.',
    pal: { main: '#241a3a', dark: '#0d0718', light: '#c9a6ff', glow: '#a24dff', accent: '#ff4d8b', visor: '#e9d5ff', deep: '#4a2a7a' },
    perk: { antiGrav: true },
  },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

/** Flammenzunge — für Rucksack, Schubdüsen und Antriebe. */
export function drawFlame(ctx, x, y, len, w, t, inner = '#fff6c9', outer = '#ff7a1a') {
  if (len <= 0.5) return;
  const flick = 1 + Math.sin(t * 34) * 0.12 + Math.sin(t * 61) * 0.06;
  const l = len * flick;
  const g = ctx.createLinearGradient(x, y, x, y + l);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.42, y + l * 0.6, x, y + l);
  ctx.quadraticCurveTo(x + w * 0.42, y + l * 0.6, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x, y + l * 0.16, w * 0.22, l * 0.22, 0, 0, TAU);
  ctx.fill();
}

function eyes(ctx, p, a, cx, cy, r, spread) {
  const blink = a.blink;
  const look = clamp(a.lean * 1.6, -1, 1) * r * 0.35;
  for (const s of [-1, 1]) {
    const ex = cx + s * spread;
    ctx.fillStyle = '#0a0f1e';
    ctx.beginPath();
    ctx.ellipse(ex, cy, r, r * (1 - blink * 0.92), 0, 0, TAU);
    ctx.fill();
    if (blink < 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(ex + look + r * 0.25, cy - r * 0.3, r * 0.3, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- Astronaut
function drawAstro(ctx, p, a) {
  const swing = Math.sin(a.limb) * (a.grounded ? 6 : 3);
  // Rucksack
  ctx.fillStyle = p.deep;
  roundRect(ctx, -13, -8, 26, 20, 6); ctx.fill();
  ctx.fillStyle = p.accent;
  roundRect(ctx, -10, -5, 6, 12, 3); ctx.fill();
  roundRect(ctx, 4, -5, 6, 12, 3); ctx.fill();
  drawFlame(ctx, -7, 11, a.jet * 22, 8, a.t);
  drawFlame(ctx, 7, 11, a.jet * 22, 8, a.t + 0.4);

  // Beine
  ctx.strokeStyle = p.main; ctx.lineCap = 'round'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-7 + swing * 0.6, 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(7 - swing * 0.6, 20); ctx.stroke();
  ctx.strokeStyle = p.dark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-7 + swing * 0.6, 20); ctx.lineTo(-10 + swing * 0.6, 21); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7 - swing * 0.6, 20); ctx.lineTo(10 - swing * 0.6, 21); ctx.stroke();

  // Körper
  const g = ctx.createLinearGradient(-14, -12, 14, 14);
  g.addColorStop(0, p.light); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  roundRect(ctx, -12, -9, 24, 22, 9); ctx.fill();
  ctx.fillStyle = p.accent;
  roundRect(ctx, -12, 0, 24, 4, 2); ctx.fill();
  // Brustlicht
  ctx.fillStyle = p.glow;
  ctx.globalAlpha = 0.6 + Math.sin(a.t * 4) * 0.25;
  ctx.beginPath(); ctx.arc(0, -3, 3.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // Arme
  ctx.strokeStyle = p.main; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-17 - a.lean * 3, 4 - swing * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, -4); ctx.lineTo(17 - a.lean * 3, 4 + swing * 0.5); ctx.stroke();

  // Helm
  ctx.fillStyle = p.light;
  ctx.beginPath(); ctx.arc(0, -16, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = p.dark;
  ctx.beginPath(); ctx.arc(0, -16, 13, Math.PI * 0.15, Math.PI * 0.85); ctx.fill();
  const vg = ctx.createLinearGradient(-9, -24, 9, -8);
  vg.addColorStop(0, '#0b1d33'); vg.addColorStop(0.55, '#12406b'); vg.addColorStop(1, '#071018');
  ctx.fillStyle = vg;
  ctx.beginPath(); ctx.ellipse(0 + a.lean * 1.5, -16, 9.5, 8, 0, 0, TAU); ctx.fill();
  // Spiegelung
  ctx.fillStyle = 'rgba(120,220,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-3.5 + a.lean * 1.5, -19, 3.4, 2.2, -0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(3 + a.lean * 1.5, -13.5, 2, 1.2, 0.4, 0, TAU); ctx.fill();
  // Antenne
  ctx.strokeStyle = p.dark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, -24); ctx.lineTo(13, -30); ctx.stroke();
  ctx.fillStyle = p.glow;
  ctx.beginPath(); ctx.arc(13, -31, 2.4, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------- Roboter
function drawRobot(ctx, p, a) {
  const scan = Math.sin(a.t * 2.2) * 4;
  drawFlame(ctx, 0, 16, a.jet * 26, 12, a.t, '#fff', p.accent);
  // Beine/Schweber
  ctx.fillStyle = p.deep;
  roundRect(ctx, -11, 8, 22, 9, 4); ctx.fill();
  ctx.fillStyle = p.glow;
  ctx.globalAlpha = 0.5 + Math.sin(a.t * 8) * 0.2;
  roundRect(ctx, -8, 15, 16, 3, 1.5); ctx.fill();
  ctx.globalAlpha = 1;

  // Rumpf
  const g = ctx.createLinearGradient(-14, -10, 14, 12);
  g.addColorStop(0, p.light); g.addColorStop(0.5, p.main); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  roundRect(ctx, -13, -8, 26, 18, 5); ctx.fill();
  ctx.strokeStyle = p.deep; ctx.lineWidth = 1.5;
  roundRect(ctx, -13, -8, 26, 18, 5); ctx.stroke();
  // Nieten
  ctx.fillStyle = p.deep;
  for (const nx of [-9, 9]) for (const ny of [-4, 6]) { ctx.beginPath(); ctx.arc(nx, ny, 1.3, 0, TAU); ctx.fill(); }
  // Anzeige
  ctx.fillStyle = '#101823';
  roundRect(ctx, -7, -4, 14, 9, 2); ctx.fill();
  ctx.fillStyle = p.glow;
  for (let i = 0; i < 3; i++) {
    const h = 2 + Math.abs(Math.sin(a.t * 5 + i)) * 5;
    ctx.fillRect(-5 + i * 4, 3 - h, 2.5, h);
  }

  // Arme
  ctx.strokeStyle = p.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-18 - a.lean * 3, 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(18 - a.lean * 3, 3); ctx.stroke();
  ctx.fillStyle = p.main;
  ctx.beginPath(); ctx.arc(-18 - a.lean * 3, 4, 3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(18 - a.lean * 3, 4, 3, 0, TAU); ctx.fill();

  // Kopf
  ctx.fillStyle = p.main;
  roundRect(ctx, -11, -23, 22, 15, 5); ctx.fill();
  ctx.fillStyle = p.visor;
  roundRect(ctx, -8.5, -20, 17, 8.5, 3); ctx.fill();
  ctx.fillStyle = p.glow;
  ctx.beginPath(); ctx.arc(scan + a.lean * 2, -15.8, 2.8, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(scan + a.lean * 2, -15.8, 5.5, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // Antenne
  ctx.strokeStyle = p.dark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, -30); ctx.stroke();
  ctx.fillStyle = Math.sin(a.t * 6) > 0 ? p.accent : p.deep;
  ctx.beginPath(); ctx.arc(0, -31.5, 2.6, 0, TAU); ctx.fill();
}

// --------------------------------------------------------------------- Alien
function drawAlien(ctx, p, a) {
  const wob = Math.sin(a.t * 3) * 2;
  drawFlame(ctx, 0, 18, a.jet * 22, 10, a.t, '#eaffea', p.glow);
  // Tentakelbeine
  ctx.strokeStyle = p.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 5, 8);
    ctx.quadraticCurveTo(s * 9 + wob, 15, s * 6 - wob, 21);
    ctx.stroke();
  }
  // Körper
  const g = ctx.createRadialGradient(-4, -6, 2, 0, 2, 20);
  g.addColorStop(0, p.light); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 1, 12, 13, 0, 0, TAU); ctx.fill();
  // Flecken
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(-5, 4, 2.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4, 7, 1.8, 0, TAU); ctx.fill();
  // Gurt
  ctx.fillStyle = p.accent;
  roundRect(ctx, -12, 2, 24, 4, 2); ctx.fill();
  ctx.fillStyle = p.glow;
  ctx.beginPath(); ctx.arc(0, 4, 2.4, 0, TAU); ctx.fill();
  // Arme
  ctx.strokeStyle = p.main; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(-17 - a.lean * 3, 5 + wob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(17 - a.lean * 3, 5 - wob); ctx.stroke();
  // Kopf
  ctx.fillStyle = p.main;
  ctx.beginPath(); ctx.ellipse(0, -13, 11, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = p.light;
  ctx.beginPath(); ctx.ellipse(-3, -18, 4, 3, -0.4, 0, TAU); ctx.fill();
  // Augen
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#0a1410';
    ctx.beginPath();
    ctx.ellipse(s * 4.6, -13 + a.blink * 3, 3.4, 5 * (1 - a.blink * 0.9), s * 0.35, 0, TAU);
    ctx.fill();
    if (a.blink < 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(s * 4.6 + a.lean, -15.5, 1.2, 0, TAU); ctx.fill();
    }
  }
  // Glaskuppel
  ctx.strokeStyle = 'rgba(200,255,255,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -13, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  ctx.fillStyle = 'rgba(180,240,255,0.14)';
  ctx.beginPath(); ctx.arc(0, -13, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-6, -21, 3.5, 1.8, -0.6, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------------- Katze
function drawCat(ctx, p, a) {
  const tail = Math.sin(a.t * 4) * 0.5;
  drawFlame(ctx, -6, 12, a.jet * 20, 7, a.t);
  drawFlame(ctx, 6, 12, a.jet * 20, 7, a.t + 0.3);
  // Schwanz
  ctx.strokeStyle = p.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.quadraticCurveTo(20, 4 + tail * 8, 17, -6 + tail * 6);
  ctx.stroke();
  ctx.strokeStyle = p.light; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(18, -3 + tail * 6); ctx.lineTo(17, -6 + tail * 6); ctx.stroke();
  // Rucksack
  ctx.fillStyle = p.deep;
  roundRect(ctx, -11, -6, 22, 17, 5); ctx.fill();
  // Beine
  ctx.strokeStyle = p.main; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
  const sw = Math.sin(a.limb) * 5;
  ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-7 + sw * 0.5, 19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 8); ctx.lineTo(7 - sw * 0.5, 19); ctx.stroke();
  ctx.fillStyle = p.light;
  ctx.beginPath(); ctx.arc(-7 + sw * 0.5, 20, 3.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7 - sw * 0.5, 20, 3.2, 0, TAU); ctx.fill();
  // Anzug
  const g = ctx.createLinearGradient(-12, -8, 12, 12);
  g.addColorStop(0, p.light); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  roundRect(ctx, -11, -8, 22, 20, 8); ctx.fill();
  ctx.fillStyle = p.accent;
  roundRect(ctx, -11, 1, 22, 3.5, 2); ctx.fill();
  // Pfoten
  ctx.strokeStyle = p.main; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-16 - a.lean * 3, 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(16 - a.lean * 3, 3); ctx.stroke();
  // Helm
  ctx.fillStyle = 'rgba(180,235,255,0.22)';
  ctx.beginPath(); ctx.arc(0, -15, 13.5, 0, TAU); ctx.fill();
  // Katzenkopf im Helm
  ctx.fillStyle = p.main;
  ctx.beginPath(); ctx.ellipse(0, -14, 9.5, 8.5, 0, 0, TAU); ctx.fill();
  // Ohren
  ctx.fillStyle = p.main;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 4, -20); ctx.lineTo(s * 8.5, -24.5); ctx.lineTo(s * 8.5, -18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(s * 5.2, -20); ctx.lineTo(s * 7.6, -22.6); ctx.lineTo(s * 7.6, -19);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.main;
  }
  eyes(ctx, p, a, 0, -15, 2.3, 4);
  // Schnauze
  ctx.fillStyle = p.light;
  ctx.beginPath(); ctx.ellipse(0, -10.5, 4.5, 3.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = p.accent;
  ctx.beginPath(); ctx.moveTo(0, -12.4); ctx.lineTo(-1.6, -11); ctx.lineTo(1.6, -11); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.9;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 4, -11); ctx.lineTo(s * 10, -12.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 4, -10); ctx.lineTo(s * 10, -9.5); ctx.stroke();
  }
  // Helmglas
  ctx.strokeStyle = 'rgba(190,240,255,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -15, 13.5, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.ellipse(-5.5, -21, 3.6, 1.8, -0.6, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------- Cyborg
function drawCyber(ctx, p, a) {
  const pulse = 0.6 + Math.sin(a.t * 6) * 0.4;
  // Hologramm-Schwingen
  ctx.save();
  ctx.globalAlpha = 0.35 + pulse * 0.2;
  ctx.strokeStyle = p.glow; ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 10, -4);
    ctx.quadraticCurveTo(s * (26 + pulse * 4), -14, s * 16, -22 - pulse * 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 10, 0);
    ctx.quadraticCurveTo(s * (24 + pulse * 3), 2, s * 14, -10);
    ctx.stroke();
  }
  ctx.restore();
  drawFlame(ctx, 0, 15, a.jet * 26, 11, a.t, '#fff', p.accent);

  // Beine
  ctx.strokeStyle = p.dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const sw = Math.sin(a.limb) * 5;
  ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-7 + sw * 0.5, 19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 8); ctx.lineTo(7 - sw * 0.5, 19); ctx.stroke();
  ctx.strokeStyle = p.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(-7 + sw * 0.4, 17); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, 12); ctx.lineTo(7 - sw * 0.4, 17); ctx.stroke();

  // Rumpf
  ctx.fillStyle = p.main;
  ctx.beginPath();
  ctx.moveTo(-11, -8); ctx.lineTo(11, -8); ctx.lineTo(13, 4); ctx.lineTo(0, 13); ctx.lineTo(-13, 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = p.glow; ctx.lineWidth = 1.6; ctx.stroke();
  // Kern
  ctx.fillStyle = p.glow;
  ctx.globalAlpha = pulse;
  ctx.beginPath(); ctx.arc(0, -1, 4.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(0, -1, 9 * pulse, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.accent;
  ctx.beginPath(); ctx.arc(0, -1, 2, 0, TAU); ctx.fill();

  // Arme
  ctx.strokeStyle = p.dark; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-18 - a.lean * 3, 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(18 - a.lean * 3, 2); ctx.stroke();
  ctx.fillStyle = p.accent;
  ctx.beginPath(); ctx.arc(18 - a.lean * 3, 3, 3.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(18 - a.lean * 3, 3, 6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // Kopf
  ctx.fillStyle = p.dark;
  roundRect(ctx, -9.5, -24, 19, 16, 6); ctx.fill();
  ctx.strokeStyle = p.light; ctx.lineWidth = 1.4;
  roundRect(ctx, -9.5, -24, 19, 16, 6); ctx.stroke();
  // Visierbalken
  ctx.fillStyle = p.visor;
  roundRect(ctx, -8, -19 + a.blink * 3, 16, 4.5 * (1 - a.blink * 0.8), 2); ctx.fill();
  ctx.globalAlpha = 0.4;
  roundRect(ctx, -10, -20, 20, 7, 3); ctx.fill();
  ctx.globalAlpha = 1;
  // Kabel
  ctx.strokeStyle = p.light; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(9, -20); ctx.quadraticCurveTo(16, -18, 14, -8);
  ctx.stroke();
}

// ------------------------------------------------------------------- Geist
function drawGhost(ctx, p, a) {
  const w = a.t * 4;
  ctx.save();
  // Aura
  const gg = ctx.createRadialGradient(0, -2, 3, 0, 0, 26);
  gg.addColorStop(0, 'rgba(160,220,255,0.4)');
  gg.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(0, -2, 26, 0, TAU); ctx.fill();

  // Schleier
  ctx.globalAlpha = 0.9;
  const g = ctx.createLinearGradient(0, -22, 0, 20);
  g.addColorStop(0, p.light); g.addColorStop(0.6, p.main); g.addColorStop(1, 'rgba(74,95,158,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-13, 4);
  ctx.arc(0, -6, 13, Math.PI, 0);
  ctx.lineTo(13, 6);
  for (let i = 0; i <= 6; i++) {
    const x = 13 - (i * 26) / 6;
    const y = 12 + Math.sin(w + i * 1.4) * 4;
    ctx.quadraticCurveTo(x + 2, y + 5, x - 2, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Augen
  ctx.fillStyle = p.glow;
  for (const s of [-1, 1]) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(s * 4.6 + a.lean * 1.5, -8, 2.6, 3.6 * (1 - a.blink * 0.9), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(s * 4.6 + a.lean * 1.5, -8, 6, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Mund
  ctx.fillStyle = 'rgba(10,16,48,0.65)';
  ctx.beginPath();
  ctx.ellipse(a.lean, -1, 2.6, 3.4 + a.jet * 2, 0, 0, TAU);
  ctx.fill();
  // Funken
  ctx.fillStyle = p.accent;
  for (let i = 0; i < 4; i++) {
    const an = w * 0.6 + (i * TAU) / 4;
    const r = 17 + Math.sin(w + i) * 4;
    ctx.globalAlpha = 0.5 + Math.sin(w * 2 + i) * 0.4;
    ctx.beginPath(); ctx.arc(Math.cos(an) * r, -4 + Math.sin(an) * r * 0.6, 1.8, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawFlame(ctx, 0, 14, a.jet * 20, 10, a.t, '#e8f1ff', p.glow);
}

// -------------------------------------------------------------------- Stern
function drawStar(ctx, p, a) {
  const pulse = 0.85 + Math.sin(a.t * 3.4) * 0.15;
  ctx.save();
  const gg = ctx.createRadialGradient(0, -2, 2, 0, -2, 30);
  gg.addColorStop(0, 'rgba(255,240,140,0.55)');
  gg.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(0, -2, 30, 0, TAU); ctx.fill();
  ctx.restore();

  drawFlame(ctx, 0, 14, a.jet * 22, 10, a.t, '#fff', p.accent);

  // Beine
  ctx.strokeStyle = p.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const sw = Math.sin(a.limb) * 5;
  ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(-7 + sw * 0.5, 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 10); ctx.lineTo(7 - sw * 0.5, 20); ctx.stroke();

  // Sternkörper
  ctx.save();
  ctx.rotate(Math.sin(a.t * 1.6) * 0.08 + a.lean * 0.1);
  const g = ctx.createRadialGradient(-3, -6, 2, 0, 0, 22);
  g.addColorStop(0, p.light); g.addColorStop(0.6, p.main); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  starPath(ctx, 0, -3, 5, 20 * pulse, 9.5 * pulse, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();

  // Gesicht
  eyes(ctx, p, a, 0, -5, 2.2, 4.5);
  ctx.strokeStyle = '#0a0f1e'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -2, 4, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  // Wangen
  ctx.fillStyle = 'rgba(255,110,90,0.45)';
  ctx.beginPath(); ctx.arc(-7, -2.5, 2.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -2.5, 2.4, 0, TAU); ctx.fill();
  // Funkeln
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    const an = a.t * 1.2 + (i * TAU) / 3;
    const r = 24 + Math.sin(a.t * 3 + i) * 3;
    ctx.globalAlpha = 0.4 + Math.sin(a.t * 4 + i * 2) * 0.4;
    starPath(ctx, Math.cos(an) * r, -3 + Math.sin(an) * r * 0.7, 4, 3.2, 1, an);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --------------------------------------------------------------------- Void
function drawVoid(ctx, p, a) {
  const spin = a.t * 1.2;
  // Akkretionsring
  ctx.save();
  ctx.rotate(spin * 0.4);
  ctx.strokeStyle = p.glow;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.ellipse(0, -2, 21, 7, 0.25, 0, TAU); ctx.stroke();
  ctx.strokeStyle = p.accent; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.ellipse(0, -2, 25, 9, -0.15, 0, TAU); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;

  drawFlame(ctx, 0, 14, a.jet * 24, 11, a.t, '#e9d5ff', p.glow);

  // Beine
  ctx.strokeStyle = p.deep; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  const sw = Math.sin(a.limb) * 5;
  ctx.beginPath(); ctx.moveTo(-5, 9); ctx.lineTo(-7 + sw * 0.5, 19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 9); ctx.lineTo(7 - sw * 0.5, 19); ctx.stroke();

  // Körper
  const g = ctx.createRadialGradient(-4, -8, 2, 0, 0, 18);
  g.addColorStop(0, p.deep); g.addColorStop(0.7, p.main); g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 12.5, 13.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = p.glow; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.7; ctx.stroke();
  ctx.globalAlpha = 1;

  // Singularität im Bauch
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(0, 1, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = p.accent; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 1, 6.4, spin, spin + 4); ctx.stroke();

  // Arme
  ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-18 - a.lean * 3, 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(18 - a.lean * 3, 3); ctx.stroke();

  // Kopf
  ctx.fillStyle = p.main;
  ctx.beginPath(); ctx.arc(0, -16, 11, 0, TAU); ctx.fill();
  ctx.strokeStyle = p.glow; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6; ctx.stroke();
  ctx.globalAlpha = 1;
  // Augen als Schlitze
  ctx.fillStyle = p.visor;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 4.2 + a.lean * 1.2, -16);
    ctx.rotate(s * -0.25);
    roundRect(ctx, -2.4, -1.6 - (1 - a.blink) * 0.6, 4.8, 3.4 * (1 - a.blink * 0.85), 1.6);
    ctx.fill();
    ctx.restore();
  }
  // Bruchstücke
  ctx.fillStyle = p.dark;
  for (let i = 0; i < 5; i++) {
    const an = spin * 0.8 + (i * TAU) / 5;
    const r = 24 + Math.sin(spin * 2 + i) * 3;
    ctx.save();
    ctx.translate(Math.cos(an) * r, -6 + Math.sin(an) * r * 0.55);
    ctx.rotate(an * 2);
    ctx.fillStyle = i % 2 ? p.glow : p.accent;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(-2, -1.2, 4, 2.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

const SHAPES = {
  astro: drawAstro,
  robot: drawRobot,
  alien: drawAlien,
  cat: drawCat,
  cyber: drawCyber,
  ghost: drawGhost,
  star: drawStar,
  void: drawVoid,
};

/**
 * Zeichnet eine Figur im lokalen Raum. `a` ist der Animationszustand:
 * { t, lean, limb, jet, blink, grounded }
 */
export function drawSkin(ctx, skin, a) {
  const fn = SHAPES[skin.shape] || drawAstro;
  ctx.save();
  ctx.lineJoin = 'round';
  fn(ctx, skin.pal, a);
  ctx.restore();
}

/** Standbild für Menü und Auswahl. */
export function skinPortrait(canvas, skin, t = 0) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 96;
  const h = canvas.clientHeight || 96;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2 + h * 0.08);
  const s = Math.min(w, h) / 78;
  ctx.scale(s, s);
  drawSkin(ctx, skin, {
    t,
    lean: Math.sin(t * 1.1) * 0.35,
    limb: t * 3,
    jet: 0,
    blink: Math.max(0, Math.sin(t * 1.7 + 1.2) - 0.93) * 14,
    grounded: false,
  });
  ctx.restore();
}
