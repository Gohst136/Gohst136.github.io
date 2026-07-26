// Die vier Hauptansichten: Heute, Tagebuch, Training, Profil.

import { el, num, dec, clamp, tap, prettyDate, weekday, lastDays, todayKey, sum, debounce, norm } from './util.js';
import * as state from './state.js';
import { MEALS } from './state.js';
import { ACTIVITIES, burnedKcal, bmiInfo, GOALS, ACTIVITY_LEVELS } from './nutrition.js';
import { openSheet, toast, confirmSheet, calorieRing, macroBar, barChart, lineChart } from './ui.js';
import { openFoodPicker, openPortionSheet } from './food-picker.js';
import { startScan } from './scan.js';
import { openProfileSheet, openAiSettings, openDataSheet } from './settings.js';
import { hasKey } from './ai.js';

// ————————————————————————————————————————————————— Heute

export function renderToday(root, key) {
  const t = state.totals(key);
  const g = state.goals();
  const rest = g.kcal + t.burned - t.kcal;

  const ring = calorieRing();
  ring.set(g.kcal > 0 ? t.kcal / (g.kcal + t.burned) : 0);

  const hero = el('section', { class: 'card card-hero' },
    el('div', { class: 'ring-wrap' },
      ring.svg,
      el('div', { class: 'ring-center' },
        el('b', { class: rest < 0 ? 'over' : '', text: num(Math.abs(rest)) }),
        el('span', { text: rest < 0 ? 'kcal drüber' : 'kcal übrig' }))),
    el('div', { class: 'hero-stats' },
      stat('Gegessen', num(t.kcal), 'kcal'),
      stat('Verbrannt', num(t.burned), 'kcal'),
      stat('Ziel', num(g.kcal), 'kcal')));

  const macros = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Makronährstoffe' }),
    macroBar('Eiweiß', t.p, g.protein, '--c-protein'),
    macroBar('Kohlenhydrate', t.c, g.carbs, '--c-carbs'),
    macroBar('Fett', t.f, g.fat, '--c-fat'));

  const scanCard = el('button', {
    class: 'card card-cta',
    onclick: () => startScan(key),
  },
  el('span', { class: 'cta-icon', text: '📸' }),
  el('div', {},
    el('b', { text: 'Mahlzeit fotografieren' }),
    el('small', { text: hasKey() ? 'Portion und Nährwerte werden geschätzt' : 'Einmalig API-Schlüssel hinterlegen' })),
  el('span', { class: 'cta-arrow', text: '›' }));

  const mealCards = el('section', { class: 'card card-tight' },
    el('h3', { class: 'card-title', text: 'Mahlzeiten' }),
    ...MEALS.map((m) => {
      const mt = state.mealTotals(key, m.id);
      return el('div', { class: 'meal-row' },
        el('button', {
          class: 'meal-main',
          onclick: () => { tap(); document.dispatchEvent(new CustomEvent('fk:goto', { detail: 'diary' })); },
        },
        el('span', { class: 'meal-icon', text: m.icon }),
        el('div', { class: 'meal-text' },
          el('b', { text: m.name }),
          el('small', { text: mt.count ? `${mt.count} ${mt.count === 1 ? 'Eintrag' : 'Einträge'}` : 'noch leer' })),
        el('span', { class: 'meal-kcal', text: `${num(mt.kcal)} kcal` })),
        el('button', {
          class: 'meal-add', 'aria-label': `${m.name} ergänzen`,
          onclick: () => { tap(); openFoodPicker(key, m.id); },
        }, '＋'));
    }));

  const water = waterCard(key, g.water);

  const trainT = state.dayOrEmpty(key).workouts || [];
  const trainCard = el('button', {
    class: 'card card-cta',
    onclick: () => document.dispatchEvent(new CustomEvent('fk:goto', { detail: 'train' })),
  },
  el('span', { class: 'cta-icon', text: '🔥' }),
  el('div', {},
    el('b', { text: trainT.length ? `${trainT.length} Einheit${trainT.length === 1 ? '' : 'en'} · ${num(t.burned)} kcal` : 'Training eintragen' }),
    el('small', { text: trainT.length ? trainT.map((w) => w.name).join(', ') : 'Verbrauch erhöht dein Tagesbudget' })),
  el('span', { class: 'cta-arrow', text: '›' }));

  root.replaceChildren(hero, scanCard, macros, mealCards, water, trainCard);
}

function stat(label, value, unit) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat-val' }, el('b', { text: value }), el('span', { text: unit })),
    el('small', { text: label }));
}

function waterCard(key, goalMl) {
  const ml = state.dayOrEmpty(key).water || 0;
  const glasses = Math.round(goalMl / 250);
  const full = Math.floor(ml / 250);

  const dots = el('div', { class: 'water-dots' },
    ...Array.from({ length: clamp(glasses, 4, 12) }, (_, i) => el('button', {
      class: `glass${i < full ? ' full' : ''}`,
      'aria-label': `${(i + 1) * 250} ml`,
      onclick: () => { tap(); state.setWater(key, (i + 1) * 250 === ml ? i * 250 : (i + 1) * 250); },
    }, '')));

  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { class: 'card-title', text: 'Wasser' }),
      el('span', { class: 'card-value', text: `${dec(ml / 1000)} / ${dec(goalMl / 1000)} l` })),
    dots,
    el('div', { class: 'chips' },
      el('button', { class: 'chip', onclick: () => { tap(); state.setWater(key, ml + 250); } }, '+ 250 ml'),
      el('button', { class: 'chip', onclick: () => { tap(); state.setWater(key, ml + 500); } }, '+ 500 ml'),
      el('button', { class: 'chip', onclick: () => { tap(); state.setWater(key, Math.max(0, ml - 250)); } }, '− 250 ml')));
}

// ————————————————————————————————————————————————— Tagebuch

export function renderDiary(root, key) {
  const t = state.totals(key);
  const g = state.goals();

  const summary = el('section', { class: 'card card-sum' },
    el('div', { class: 'sum-main' },
      el('b', { text: num(t.kcal) }),
      el('span', { text: `von ${num(g.kcal + t.burned)} kcal` })),
    el('div', { class: 'sum-bar' },
      el('i', { style: { width: `${clamp(t.kcal / Math.max(1, g.kcal + t.burned), 0, 1) * 100}%` } })),
    el('div', { class: 'sum-macros' },
      el('span', {}, el('i', { style: { background: 'var(--c-protein)' } }), `${dec(t.p)} g`),
      el('span', {}, el('i', { style: { background: 'var(--c-carbs)' } }), `${dec(t.c)} g`),
      el('span', {}, el('i', { style: { background: 'var(--c-fat)' } }), `${dec(t.f)} g`)));

  const sections = MEALS.map((m) => {
    const entries = state.dayOrEmpty(key).meals?.[m.id] || [];
    const mt = state.mealTotals(key, m.id);

    const rows = entries.map((e) => el('button', {
      class: 'row row-entry',
      onclick: () => { tap(); openPortionSheet({ dateKey: key, mealId: m.id, entry: e }); },
    },
    el('div', { class: 'row-main' },
      el('div', { class: 'row-title' },
        e.name,
        e.src === 'ai' && el('span', { class: 'tag tag-ai', text: '📸' })),
      el('div', { class: 'row-sub', text: `${num(e.amount)} ${e.unit} · ${dec(e.p)} E · ${dec(e.c)} K · ${dec(e.f)} F` })),
    el('span', { class: 'row-kcal', text: `${num(e.kcal)}` })));

    return el('section', { class: 'card card-tight' },
      el('div', { class: 'card-head' },
        el('h3', { class: 'card-title' }, el('span', { class: 'meal-icon', text: m.icon }), m.name),
        el('span', { class: 'card-value', text: `${num(mt.kcal)} kcal` })),
      entries.length ? el('div', { class: 'list' }, ...rows) : el('p', { class: 'empty', text: 'Noch nichts eingetragen.' }),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { tap(); openFoodPicker(key, m.id); } }, '＋ Lebensmittel'),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => startScan(key, m.id) }, '📸 Foto')));
  });

  root.replaceChildren(summary, ...sections);
}

// ————————————————————————————————————————————————— Training

export function renderTrain(root, key) {
  const d = state.dayOrEmpty(key);
  const workouts = d.workouts || [];
  const burned = sum(workouts, (w) => w.kcal);

  const head = el('section', { class: 'card card-hero-sm' },
    el('div', { class: 'burn' },
      el('span', { class: 'burn-icon', text: '🔥' }),
      el('b', { text: num(burned) }),
      el('span', { text: 'kcal verbrannt' })),
    el('p', { class: 'muted small', text: 'Kommt oben auf dein Tagesbudget drauf.' }));

  const list = workouts.length
    ? el('div', { class: 'list' }, ...workouts.map((w) => el('div', { class: 'row row-workout' },
      el('span', { class: 'w-icon', text: w.icon || '🏃' }),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title', text: w.name }),
        el('div', { class: 'row-sub', text: `${w.minutes} Min` })),
      el('span', { class: 'row-kcal', text: `${num(w.kcal)}` }),
      el('button', {
        class: 'row-del', 'aria-label': 'Löschen',
        onclick: async () => {
          if (await confirmSheet({ title: 'Einheit löschen?', text: w.name })) {
            state.removeWorkout(key, w.id);
            toast('Gelöscht');
          }
        },
      }, '✕'))))
    : el('p', { class: 'empty', text: 'Heute noch keine Bewegung eingetragen.' });

  const card = el('section', { class: 'card card-tight' },
    el('h3', { class: 'card-title', text: 'Einheiten' }),
    list,
    el('div', { class: 'row-actions' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => openWorkoutSheet(key) }, '＋ Aktivität')));

  const days = lastDays(key, 7);
  const chart = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Letzte 7 Tage' }),
    barChart(days.map((k) => ({
      label: weekday(k),
      value: sum(state.dayOrEmpty(k).workouts || [], (w) => w.kcal),
      highlight: k === key,
    })), { unit: 'kcal' }));

  root.replaceChildren(head, card, chart, weightCard(key));
}

function weightCard(key) {
  const d = state.dayOrEmpty(key);
  const series = state.weightSeries();
  const input = el('input', {
    class: 'input', type: 'number', inputmode: 'decimal', step: '0.1',
    placeholder: String(state.get().profile.weight),
    value: d.weight ? String(d.weight) : '',
  });
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { class: 'card-title', text: 'Gewicht' }),
      el('span', { class: 'card-value', text: prettyDate(key) })),
    el('div', { class: 'row-inline' },
      el('div', { class: 'input-suffix' }, input, el('span', { text: 'kg' })),
      el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: () => {
          const v = Number(input.value);
          if (!v) { toast('Bitte Gewicht eintragen.', 'warn'); return; }
          state.setWeight(key, Math.round(v * 10) / 10);
          tap(); toast('Gespeichert');
        },
      }, 'Sichern')),
    series.length > 1 ? lineChart(series.slice(-30)) : el('p', { class: 'muted tiny', text: 'Ab zwei Messungen zeichnet die App eine Kurve.' }));
}

export function openWorkoutSheet(key) {
  const weight = state.get().profile.weight;
  let picked = ACTIVITIES[0];
  let minutes = 30;

  const preview = el('div', { class: 'portion-preview' });
  const listBox = el('div', { class: 'list' });
  const search = el('input', { class: 'input input-search', type: 'search', placeholder: 'Aktivität suchen …' });
  const minutesInput = el('input', { class: 'input input-amount', type: 'number', inputmode: 'numeric', value: '30', min: '1', step: '5' });

  const draw = () => {
    const kcal = burnedKcal(picked.met, minutes, weight);
    preview.replaceChildren(
      el('div', { class: 'pp-kcal' }, el('b', { text: num(kcal) }), el('span', { text: 'kcal' })),
      el('div', { class: 'pp-macros' }, el('span', { text: `${picked.icon} ${picked.name} · ${minutes} Min · ${dec(weight)} kg` })));
  };

  const drawList = () => {
    const q = norm(search.value);
    const items = ACTIVITIES.filter((a) => !q || norm(a.name).includes(q));
    listBox.replaceChildren(...items.map((a) => el('button', {
      class: `row row-act${a.id === picked.id ? ' active' : ''}`,
      onclick: () => { tap(); picked = a; drawList(); draw(); },
    },
    el('span', { class: 'w-icon', text: a.icon }),
    el('div', { class: 'row-main' },
      el('div', { class: 'row-title', text: a.name }),
      el('div', { class: 'row-sub', text: `${burnedKcal(a.met, 30, weight)} kcal / 30 Min` })),
    el('span', { class: 'row-plus', text: a.id === picked.id ? '✓' : '' }))));
  };

  const setMinutes = (v) => {
    minutes = clamp(Math.round(v), 1, 600);
    minutesInput.value = String(minutes);
    draw();
  };
  minutesInput.addEventListener('input', () => { minutes = Number(minutesInput.value) || 0; draw(); });
  search.addEventListener('input', debounce(drawList, 100));

  const sheet = openSheet({
    title: 'Aktivität eintragen',
    full: true,
    body: [
      preview,
      el('div', { class: 'amount-row' },
        el('button', { class: 'step', onclick: () => { tap(); setMinutes(minutes - 5); } }, '−'),
        el('div', { class: 'input-suffix' }, minutesInput, el('span', { text: 'Min' })),
        el('button', { class: 'step', onclick: () => { tap(); setMinutes(minutes + 5); } }, '＋')),
      el('div', { class: 'chips' }, ...[15, 30, 45, 60, 90].map((m) => el('button', {
        class: 'chip', onclick: () => { tap(); setMinutes(m); },
      }, `${m} Min`))),
      search,
      listBox,
    ],
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => {
        state.addWorkout(key, {
          name: picked.name, icon: picked.icon, met: picked.met,
          minutes, kcal: burnedKcal(picked.met, minutes, weight),
        });
        tap(12); sheet.close(); toast('Eingetragen');
      },
    }, 'Hinzufügen'),
  });

  drawList();
  draw();
  return sheet;
}

// ————————————————————————————————————————————————— Profil

export function renderProfile(root, key) {
  const p = state.get().profile;
  const g = state.goals();
  const { bmi, label } = bmiInfo(p.weight, p.height);
  const days = lastDays(todayKey(), 7);
  const kcals = days.map((k) => state.totals(k).kcal);
  const tracked = kcals.filter((v) => v > 0);
  const avg = tracked.length ? Math.round(sum(tracked) / tracked.length) : 0;
  const goalName = p.custom ? 'Eigene Zielwerte' : (GOALS.find((x) => x.id === p.goal)?.name || '');
  const actName = ACTIVITY_LEVELS.find((x) => x.id === p.activity)?.name || '';

  const goalCard = el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { class: 'card-title', text: 'Dein Tagesziel' }),
      el('button', { class: 'link', onclick: openProfileSheet }, 'Ändern')),
    el('div', { class: 'goal-preview' },
      el('div', { class: 'gp-main' }, el('b', { text: num(g.kcal) }), el('span', { text: 'kcal / Tag' })),
      el('div', { class: 'gp-macros' },
        el('span', {}, el('i', { style: { background: 'var(--c-protein)' } }), `${num(g.protein)} g Eiweiß`),
        el('span', {}, el('i', { style: { background: 'var(--c-carbs)' } }), `${num(g.carbs)} g Kohlenh.`),
        el('span', {}, el('i', { style: { background: 'var(--c-fat)' } }), `${num(g.fat)} g Fett`))),
    el('div', { class: 'kv' },
      kv('Ziel', goalName),
      kv('Aktivität', actName),
      kv('Gewicht', `${dec(p.weight)} kg`),
      kv('BMI', `${dec(bmi)} · ${label}`)));

  const statsCard = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Woche' }),
    barChart(days.map((k, i) => ({ label: weekday(k), value: kcals[i], highlight: k === todayKey() })), { goal: g.kcal }),
    el('div', { class: 'kv' },
      kv('Ø Kalorien', avg ? `${num(avg)} kcal` : '—'),
      kv('Tage in Folge', `${state.streak()}`)));

  const weights = state.weightSeries();
  const weightBlock = weights.length > 1
    ? el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', { class: 'card-title', text: 'Gewichtsverlauf' }),
        el('span', { class: 'card-value', text: `${dec(weights[weights.length - 1].kg)} kg` })),
      lineChart(weights.slice(-40)),
      el('p', { class: 'muted tiny', text: `${weights.length} Messungen · seit ${prettyDate(weights[0].key)}` }))
    : null;

  const settings = el('section', { class: 'card card-tight' },
    el('h3', { class: 'card-title', text: 'Einstellungen' }),
    settingRow('📸', 'Foto-Erkennung', hasKey() ? 'Schlüssel hinterlegt' : 'Nicht eingerichtet', openAiSettings),
    settingRow('🎯', 'Profil & Ziel', `${goalName} · ${actName}`, openProfileSheet),
    settingRow('💾', 'Daten', 'Export, Import, zurücksetzen', openDataSheet));

  const about = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Zum Home-Bildschirm' }),
    el('p', { class: 'muted small' }, 'In Safari auf „Teilen" tippen und „Zum Home-Bildschirm" wählen. Danach startet Formkurve im Vollbild und funktioniert offline.'),
    el('p', { class: 'muted tiny', text: 'Formkurve 1.0 · Daten bleiben lokal auf diesem Gerät' }));

  root.replaceChildren(goalCard, statsCard, ...(weightBlock ? [weightBlock] : []), settings, about);
}

function kv(k, v) {
  return el('div', { class: 'kv-row' }, el('span', { text: k }), el('b', { text: v }));
}

function settingRow(icon, title, sub, onclick) {
  return el('button', { class: 'meal-row set-row', onclick: () => { tap(); onclick(); } },
    el('span', { class: 'meal-icon', text: icon }),
    el('div', { class: 'meal-text' }, el('b', { text: title }), el('small', { text: sub })),
    el('span', { class: 'cta-arrow', text: '›' }));
}
