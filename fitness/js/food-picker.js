// Lebensmittel suchen, Portion einstellen, eigene Einträge anlegen.

import { el, num, dec, debounce, tap, clamp } from './util.js';
import { FOODS, searchFoods, foodById } from './foods.js';
import * as state from './state.js';
import { MEALS } from './state.js';
import { openSheet, toast, confirmSheet, field, numberInput, segmented } from './ui.js';

const allFoods = () => [...state.get().customFoods, ...FOODS];
const lookup = (id) => state.get().customFoods.find((f) => f.id === id) || foodById(id);

/** Rechnet ein Lebensmittel auf eine Menge um. */
export function scale(food, amount) {
  const k = amount / 100;
  return {
    foodId: food.id,
    name: food.name,
    amount,
    unit: food.unit || 'g',
    kcal: Math.round(food.per100.kcal * k),
    p: Math.round(food.per100.p * k * 10) / 10,
    c: Math.round(food.per100.c * k * 10) / 10,
    f: Math.round(food.per100.f * k * 10) / 10,
    src: food.own ? 'own' : 'db',
  };
}

function foodRow(food, onPick) {
  const fav = state.get().favorites.includes(food.id);
  return el('button', { class: 'row row-food', onclick: () => { tap(); onPick(food); } },
    el('div', { class: 'row-main' },
      el('div', { class: 'row-title' }, food.name, food.own && el('span', { class: 'tag', text: 'eigen' })),
      el('div', { class: 'row-sub', text: `${num(food.per100.kcal)} kcal / 100 ${food.unit} · ${dec(food.per100.p)} E · ${dec(food.per100.c)} K · ${dec(food.per100.f)} F` })),
    fav && el('span', { class: 'row-star', text: '★' }),
    el('span', { class: 'row-plus', text: '+' }));
}

/** Auswahl-Sheet für eine Mahlzeit. */
export function openFoodPicker(dateKey, mealId) {
  const meal = MEALS.find((m) => m.id === mealId);
  const list = el('div', { class: 'list' });
  const search = el('input', {
    class: 'input input-search', type: 'search', placeholder: 'Lebensmittel suchen …',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
  });

  let filter = 'recent';

  const render = () => {
    const q = search.value.trim();
    let items;
    if (q) {
      items = searchFoods(q, state.get().customFoods);
    } else if (filter === 'recent') {
      items = state.get().recent.map(lookup).filter(Boolean);
    } else if (filter === 'fav') {
      items = state.get().favorites.map(lookup).filter(Boolean);
    } else if (filter === 'own') {
      items = state.get().customFoods;
    } else {
      items = allFoods();
    }

    list.replaceChildren();
    if (!items.length) {
      const hints = {
        recent: 'Noch nichts eingetragen. Suche oben oder wechsle auf „Alle".',
        fav: 'Keine Favoriten. Halte in der Liste auf einen Eintrag … oder markiere ihn beim Bearbeiten.',
        own: 'Noch keine eigenen Lebensmittel angelegt.',
        all: 'Nichts gefunden.',
      };
      list.append(el('p', { class: 'empty', text: q ? 'Nichts gefunden.' : hints[filter] }));
    }
    for (const f of items.slice(0, 80)) {
      list.append(foodRow(f, (food) => openPortionSheet({ dateKey, mealId, food })));
    }
  };

  search.addEventListener('input', debounce(render, 120));

  const tabs = segmented([
    { value: 'recent', label: 'Zuletzt' },
    { value: 'fav', label: 'Favoriten' },
    { value: 'own', label: 'Eigene' },
    { value: 'all', label: 'Alle' },
  ], filter, (v) => { filter = v; render(); });

  const onAdded = () => sheet.close();

  const sheet = openSheet({
    title: meal ? `${meal.name} ergänzen` : 'Lebensmittel',
    full: true,
    onClose: () => document.removeEventListener('fk:food-added', onAdded),
    body: [
      search,
      tabs,
      list,
      el('button', {
        class: 'btn btn-ghost btn-wide',
        onclick: () => openCustomFoodSheet((food) => openPortionSheet({ dateKey, mealId, food })),
      }, '＋ Eigenes Lebensmittel anlegen'),
    ],
  });

  document.addEventListener('fk:food-added', onAdded);
  render();
  return sheet;
}

/**
 * Portion einstellen — entweder für ein neues Lebensmittel (food) oder zum
 * Bearbeiten eines bestehenden Eintrags (entry).
 */
export function openPortionSheet({ dateKey, mealId, food, entry }) {
  const base = food || lookup(entry.foodId);
  const editing = Boolean(entry);

  // Bei freien Einträgen (z. B. aus der Foto-Erkennung) gibt es kein Referenz-
  // Lebensmittel — dann rechnen wir aus den gespeicherten Werten zurück.
  const per100 = base?.per100 || {
    kcal: (entry.kcal / entry.amount) * 100,
    p: (entry.p / entry.amount) * 100,
    c: (entry.c / entry.amount) * 100,
    f: (entry.f / entry.amount) * 100,
  };
  const ref = base || { id: entry.foodId, name: entry.name, per100, unit: entry.unit, portion: entry.amount, own: entry.src === 'own' };

  let amount = entry ? entry.amount : (base?.portion || 100);
  let targetMeal = mealId;

  const preview = el('div', { class: 'portion-preview' });
  const amountInput = el('input', {
    class: 'input input-amount', type: 'number', inputmode: 'decimal',
    value: String(amount), min: '0', step: '5',
  });

  const draw = () => {
    const s = scale(ref, amount);
    preview.replaceChildren(
      el('div', { class: 'pp-kcal' }, el('b', { text: num(s.kcal) }), el('span', { text: 'kcal' })),
      el('div', { class: 'pp-macros' },
        el('span', {}, el('i', { style: { background: 'var(--c-protein)' } }), `${dec(s.p)} g Eiweiß`),
        el('span', {}, el('i', { style: { background: 'var(--c-carbs)' } }), `${dec(s.c)} g Kohlenh.`),
        el('span', {}, el('i', { style: { background: 'var(--c-fat)' } }), `${dec(s.f)} g Fett`)));
  };

  const setAmount = (v) => {
    amount = clamp(Math.round(v), 0, 5000);
    amountInput.value = String(amount);
    draw();
  };

  amountInput.addEventListener('input', () => { amount = Number(amountInput.value) || 0; draw(); });

  const quick = el('div', { class: 'chips' },
    ...[0.5, 1, 1.5, 2].map((mult) => el('button', {
      class: 'chip',
      onclick: () => { tap(); setAmount((ref.portion || 100) * mult); },
    }, mult === 1 ? '1 Portion' : `${dec(mult)}×`)),
    ...[50, 100, 250].map((v) => el('button', {
      class: 'chip', onclick: () => { tap(); setAmount(v); },
    }, `${v} ${ref.unit}`)));

  const mealPicker = segmented(
    MEALS.map((m) => ({ value: m.id, label: m.name.replace('essen', '') })),
    targetMeal, (v) => { targetMeal = v; },
  );

  const isFav = () => state.get().favorites.includes(ref.id);
  const favBtn = el('button', {
    class: `btn btn-ghost${isFav() ? ' is-fav' : ''}`,
    onclick: () => {
      state.toggleFavorite(ref.id);
      favBtn.classList.toggle('is-fav', isFav());
      favBtn.textContent = isFav() ? '★ Favorit' : '☆ Favorit';
      tap();
    },
  }, isFav() ? '★ Favorit' : '☆ Favorit');

  const sheet = openSheet({
    title: ref.name,
    subtitle: `${num(per100.kcal)} kcal pro 100 ${ref.unit}`,
    body: [
      preview,
      el('div', { class: 'amount-row' },
        el('button', { class: 'step', onclick: () => { tap(); setAmount(amount - 10); } }, '−'),
        el('div', { class: 'input-suffix' }, amountInput, el('span', { text: ref.unit })),
        el('button', { class: 'step', onclick: () => { tap(); setAmount(amount + 10); } }, '＋')),
      quick,
      el('p', { class: 'label-small', text: 'Mahlzeit' }),
      mealPicker,
    ],
    footer: [
      el('div', { class: 'foot-row' },
        ref.id && !String(ref.id).startsWith('ai') ? favBtn : null,
        editing && el('button', {
          class: 'btn btn-danger-ghost',
          onclick: async () => {
            if (await confirmSheet({ title: 'Eintrag löschen?', text: ref.name })) {
              state.removeEntry(dateKey, mealId, entry.id);
              sheet.close();
              toast('Gelöscht');
            }
          },
        }, 'Löschen')),
      el('button', {
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          if (amount <= 0) { toast('Menge fehlt.', 'warn'); return; }
          const scaled = scale(ref, amount);
          if (editing) {
            if (targetMeal !== mealId) {
              state.removeEntry(dateKey, mealId, entry.id);
              state.addEntry(dateKey, targetMeal, { ...scaled, src: entry.src });
            } else {
              state.updateEntry(dateKey, mealId, entry.id, scaled);
            }
            toast('Aktualisiert');
          } else {
            state.addEntry(dateKey, targetMeal, scaled);
            toast(`${ref.name} eingetragen`);
          }
          tap(12);
          sheet.close();
          // Auch das darunterliegende Suchsheet schließen.
          if (!editing) document.dispatchEvent(new CustomEvent('fk:food-added'));
        },
      }, editing ? 'Speichern' : 'Hinzufügen'),
    ],
  });

  draw();
  return sheet;
}

/** Eigenes Lebensmittel anlegen (Werte pro 100 g/ml). */
export function openCustomFoodSheet(onCreated) {
  const values = { name: '', kcal: 0, p: 0, c: 0, f: 0, unit: 'g', portion: 100 };

  const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'z. B. Omas Lasagne' });
  nameInput.addEventListener('input', () => { values.name = nameInput.value; });

  const mk = (key, label, suffix) => field(label,
    numberInput(0, { suffix, step: key === 'kcal' ? 1 : 0.1, oninput: (v) => { values[key] = v; } }));

  const sheet = openSheet({
    title: 'Eigenes Lebensmittel',
    subtitle: 'Alle Angaben pro 100 g bzw. 100 ml',
    body: [
      field('Name', nameInput),
      el('div', { class: 'grid-2' },
        mk('kcal', 'Kalorien', 'kcal'),
        mk('p', 'Eiweiß', 'g'),
        mk('c', 'Kohlenhydrate', 'g'),
        mk('f', 'Fett', 'g')),
      el('p', { class: 'label-small', text: 'Einheit' }),
      segmented([{ value: 'g', label: 'Gramm' }, { value: 'ml', label: 'Milliliter' }], 'g', (v) => { values.unit = v; }),
      field('Übliche Portion', numberInput(100, { step: 10, suffix: 'g/ml', oninput: (v) => { values.portion = v; } })),
    ],
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => {
        if (!values.name.trim()) { toast('Name fehlt.', 'warn'); return; }
        const food = state.addCustomFood({
          name: values.name.trim(),
          per100: { kcal: values.kcal, p: values.p, c: values.c, f: values.f },
          unit: values.unit,
          portion: values.portion || 100,
          cat: 'Eigene',
        });
        sheet.close();
        toast('Gespeichert');
        onCreated?.(food);
      },
    }, 'Speichern'),
  });
  return sheet;
}
