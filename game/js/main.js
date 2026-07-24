/* Aufbau und Verdrahtung. */

import * as G from './state.js';
import * as UI from './ui.js';
import { Arena } from './combat.js';
import { ability } from './fusion.js';
import { $, buzz } from './util.js';

G.init();

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

/* ---------------- Navigation ---------------- */

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => UI.switchTo(tab.dataset.screen));
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
  UI.showReveal(res.ability, res.isNew, parents);
  arena.syncDeck();
});

$('#revealOk').addEventListener('click', () => {
  UI.closeReveal();
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
  if (what !== 'fuse') UI.refreshCurrent();
});

/* ---------------- Größe & Sichtbarkeit ---------------- */

const fit = () => {
  arena.resize();
};
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) arena.stop();
  else if (UI.currentScreen() === 'battle') { arena.last = performance.now(); arena.start(); }
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
      G.persist();
    });
  }
});

/* Für die Konsole: nützlich zum Nachschauen, was gerade im Spielstand steht. */
window.AF = { arena, state: G, ui: UI, ability };

/* ---------------- Offline-Betrieb ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
