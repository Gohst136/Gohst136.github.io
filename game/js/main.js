/* Aufbau und Verdrahtung. */

import * as G from './state.js';
import * as UI from './ui.js';
import { Arena } from './combat.js';
import { ability } from './fusion.js';
import { simulate } from './idle.js';
import { MAX_OFFLINE_SECONDS } from './data.js';
import { armOnFirstGesture, setEnabled as setSound, sfx } from './audio.js';
import { $, buzz } from './util.js';

G.init();
setSound(!!G.S.opt.sound);
armOnFirstGesture();

/* Wie lange war das Spiel zu? Muss ganz am Anfang stehen: sobald der
   Sekundentakt läuft, wäre die Zeit schon verrechnet. */
const AWAY_SECONDS = Math.max(0, (Date.now() - (G.S.lastTick || Date.now())) / 1000);
G.S.lastTick = Date.now();

/* ---------------- Arena ---------------- */

let hudThrottle = 0;
let emptyWarn = 0;

const arena = new Arena($('#arena'), {
  getDeck:  () => G.deckAbilities(),
  getWave:  () => G.S.wave,
  getCore:  () => G.coreStats(),
  onEssence: (n, kind) => {
    G.addEssence(n);
    if (kind === 'kill') G.addKill();
  },
  onWaveCleared: (w) => {
    const before = G.slots();
    G.onWaveCleared(w);
    if (G.slots() > before) UI.toast('Neuer Ausrüstungsplatz frei!', 'good');
    celebrate(G.checkMilestones());
  },
  onDefeat: (w) => {
    G.onDefeat(w);
    $('#deadText').textContent =
      `Welle ${w} war zu stark. Du startest wieder bei Welle ${G.S.wave} — deine Essenz behältst du.`;
    buzz([30, 60, 30]);
  },
  onHud: (h) => {
    UI.renderHud(h);
    /* Ohne ausgerüstete Fähigkeit passiert im Kampf nichts — daran erinnern. */
    if (h.state === 'fighting' && h.deck.every(a => !a) && performance.now() - emptyWarn > 12000) {
      emptyWarn = performance.now();
      UI.toast('Kein Platz belegt — rüste im Kern eine Fähigkeit aus.', 'bad');
    }
    const now = performance.now();
    if (now - hudThrottle > 180) {
      hudThrottle = now;
      UI.renderTop();
    }
  }
});

UI.setArena(arena);
UI.initUI();

function celebrate(done) {
  for (const m of done) {
    UI.toast(`Meilenstein: ${m.name} · +${m.reward} ✦`, 'good');
  }
  if (done.length) { sfx.discover(); buzz([12, 40, 12]); }
}

/* ---------------- Wellen im Hintergrund ---------------- *
   Eine einzige Zeitachse: `lastTick` wandert immer mit. Läuft die Arena
   sichtbar, hat sie schon gerechnet und der Ticker geht leer aus. Alles
   andere — anderer Reiter, App zu, Handy im Schlaf — rechnet idle.js nach. */

const idleCtx = () => {
  const cs = G.coreStats();
  return {
    dps: G.effectivePower(),
    wave: G.S.wave,
    hp: arena.core.hp > 0 ? arena.core.hp : cs.maxHp,
    maxHp: cs.maxHp,
    regen: cs.regen,
    greed: cs.greed
  };
};

function applyIdle(seconds) {
  if (seconds <= 0) return null;
  const res = simulate(seconds, idleCtx());
  if (res.essence > 0) G.addEssence(res.essence);
  if (res.kills > 0) G.S.stats.kills += Math.round(res.kills);
  if (res.wave !== G.S.wave) {
    G.setWave(res.wave);
    if (arena.waveState !== 'dead') arena.beginWave(res.wave);
  }
  if (res.hp != null) arena.core.hp = Math.max(1, res.hp);
  celebrate(G.checkMilestones());
  G.persist();
  return res;
}

/* Wer die Arena vor sich hat, sieht ihr beim Rechnen zu — auch der
   Niederlagen-Bildschirm gehört dazu: dort steht die Zeit still, bis man sich
   entscheidet. Erst wenn man weggeht, springt der Zeitraffer ein. */
const foregroundActive = () =>
  !document.hidden && UI.currentScreen() === 'battle';

function idleTick() {
  const now = Date.now();
  const dt = (now - (G.S.lastTick || now)) / 1000;
  G.S.lastTick = now;
  if (dt <= 0) return;
  /* Bei kleinen Schritten rechnet die sichtbare Arena selbst; bei großen kann
     sie es gar nicht getan haben (der Browser friert rAF im Hintergrund ein). */
  if (dt < 5 && foregroundActive()) return;
  const res = applyIdle(Math.min(dt, MAX_OFFLINE_SECONDS));
  if (res && (res.essence > 0 || res.waves > 0)) UI.renderTop();
}

setInterval(idleTick, 1000);

/* ---------------- Navigation ---------------- */

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => { sfx.ui(); UI.switchTo(tab.dataset.screen); });
}

/* ---------------- Kampf ---------------- */

$('#btnFocus').addEventListener('click', () => {
  if (arena.tryFocus()) buzz(18);
});

$('#btnRetry').addEventListener('click', () => {
  arena.core.hp = G.coreStats().maxHp;
  arena.focus = 0;
  arena.beginWave(G.S.wave);
  $('#deadOverlay').classList.add('hidden');
});

$('#btnToForge').addEventListener('click', () => {
  arena.core.hp = G.coreStats().maxHp;
  arena.beginWave(G.S.wave);
  $('#deadOverlay').classList.add('hidden');
  UI.switchTo('forge');
});

/* ---------------- Schmiede ---------------- */

$('#btnFuse').addEventListener('click', () => {
  const [uA, uB] = UI.getSelection();
  const eA = uA ? G.invEntry(uA) : null;
  const eB = uB ? G.invEntry(uB) : null;
  if (!eA || !eB) { UI.toast('Zwei Fähigkeiten auswählen.', 'bad'); return; }
  const parents = [eA.id, eB.id];

  const res = G.doFuse(uA, uB);
  if (!res.ok) { UI.toast(res.msg, 'bad'); return; }

  UI.clearSelection();
  res.isNew ? sfx.discover() : sfx.fuse();
  UI.showReveal(res.ability, res.isNew, parents);
  arena.syncDeck();
  celebrate(G.checkMilestones());
});

$('#revealOk').addEventListener('click', () => {
  UI.closeReveal();
  UI.maybeAutoMerge();
  UI.refreshCurrent();
});

/* ---------------- Kern ---------------- */

$('#btnReset').addEventListener('click', () => {
  if (confirm('Wirklich alles löschen? Kodex, Essenz und Fortschritt sind dann weg.')) {
    G.hardReset();
    arena.core.hp = G.coreStats().maxHp;
    arena.beginWave(1);
    UI.refreshCurrent();
    UI.toast('Neuer Anfang.');
  }
});

/* ---------------- Reaktion auf Zustandsänderungen ---------------- */

G.subscribe((what) => {
  UI.renderTop();
  if (what === 'deck' || what === 'fuse' || what === 'all') arena.syncDeck();
  if (what === 'all') {
    arena.core.hp = G.coreStats().maxHp;
    arena.beginWave(G.S.wave);
  }
  if (what !== 'fuse') UI.refreshCurrent();
});

/* ---------------- Größe & Sichtbarkeit ---------------- */

const fit = () => arena.resize();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    arena.stop();
    G.S.lastTick = Date.now();
    G.persist();
  } else {
    idleTick();
    if (UI.currentScreen() === 'battle') { arena.last = performance.now(); arena.start(); }
  }
});

/* Doppeltipp-Zoom in iOS-Safari unterbinden. */
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 320) e.preventDefault();
  lastTouch = now;
}, { passive: false });

/* ---------------- Start ---------------- */

requestAnimationFrame(() => {
  arena.resize();
  arena.core.hp = G.coreStats().maxHp;
  arena.beginWave(G.S.wave);
  arena.start();
  UI.renderTop();
  UI.switchTo('battle');

  if (!G.S.seen.intro) {
    UI.showIntro(() => {
      G.S.seen.intro = true;
      G.S.lastTick = Date.now();
      G.persist();
    });
    return;
  }

  /* Was ist passiert, während das Spiel zu war? */
  if (AWAY_SECONDS > 120) {
    const away = Math.min(AWAY_SECONDS, MAX_OFFLINE_SECONDS);
    const res = applyIdle(away);
    if (res && (res.essence > 1 || res.waves > 0)) UI.showWelcomeBack(res, away / 60);
  }
});

/* Für die Konsole: nützlich zum Nachschauen, was gerade im Spielstand steht. */
window.AF = { arena, state: G, ui: UI, ability, simulate };

/* ---------------- Offline-Betrieb ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
