// Startpunkt: Zustand laden, Ansichten verdrahten, Datum verwalten.

import { $, $$, el, tap, todayKey, addDays, prettyDate, longDate, dateKey } from './util.js';
import * as state from './state.js';
import { renderToday, renderDiary, renderTrain, renderProfile } from './views.js';
import { startScan } from './scan.js';
import { openOnboarding } from './settings.js';

let view = 'today';
let current = todayKey();

const VIEWS = {
  today: { title: 'Heute', render: renderToday, day: true },
  diary: { title: 'Tagebuch', render: renderDiary, day: true },
  train: { title: 'Training', render: renderTrain, day: true },
  profile: { title: 'Profil', render: renderProfile, day: false },
};

function render() {
  const conf = VIEWS[view];
  const isToday = current === todayKey();
  const relative = prettyDate(current);

  $('#app-title').textContent = conf.title;
  $('#app-sub').textContent = conf.day
    ? (relative.includes(',') || relative === conf.title ? longDate(current) : `${relative} · ${longDate(current)}`)
    : 'Ziele, Statistik, Einstellungen';

  $('#daybar').classList.toggle('hidden', !conf.day);
  $('#day-today').classList.toggle('hidden', isToday);
  $('#day-next').disabled = isToday;

  for (const [name, v] of Object.entries(VIEWS)) {
    const node = $(`#view-${name}`);
    const active = name === view;
    node.classList.toggle('active', active);
    if (active) v.render(node, current);
  }

  $$('#tabbar .tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

function goto(name) {
  if (!VIEWS[name] || name === view) { render(); return; }
  view = name;
  tap();
  $('#views').scrollTo({ top: 0 });
  render();
}

function shiftDay(delta) {
  const next = addDays(current, delta);
  if (next > todayKey()) return;
  current = next;
  tap();
  render();
}

function wire() {
  $$('#tabbar .tab').forEach((b) => b.addEventListener('click', () => goto(b.dataset.view)));
  $('#btn-scan').addEventListener('click', () => startScan(current));
  $('#day-prev').addEventListener('click', () => shiftDay(-1));
  $('#day-next').addEventListener('click', () => shiftDay(1));
  $('#day-today').addEventListener('click', () => {
    if (current === todayKey()) return;
    current = todayKey();
    tap();
    render();
  });

  document.addEventListener('fk:goto', (e) => goto(e.detail));

  // Beim Tageswechsel (App lag im Hintergrund) auf heute springen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (current !== todayKey() && current === dateKey(new Date(Date.now() - 86400000))) current = todayKey();
    render();
  });

  // Nach links/rechts wischen wechselt den Tag.
  const main = $('#views');
  let x0 = null; let y0 = null;
  main.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (!VIEWS[view].day) return;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) shiftDay(dx > 0 ? -1 : 1);
  }, { passive: true });
}

function boot() {
  state.load();
  state.subscribe(render);
  wire();
  render();

  if (!state.get().onboarded) setTimeout(openOnboarding, 400);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline eben nicht */ });
    });
  }
}

boot();
