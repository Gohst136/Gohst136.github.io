// Alle Daten liegen lokal im Gerät (localStorage). Kein Server, kein Konto.

import { uid, todayKey, sum } from './util.js';
import { goalsFor } from './nutrition.js';

const KEY = 'formkurve:v1';

export const MEALS = [
  { id: 'b', name: 'Frühstück', icon: '🌅' },
  { id: 'l', name: 'Mittagessen', icon: '☀️' },
  { id: 'd', name: 'Abendessen', icon: '🌙' },
  { id: 's', name: 'Snacks', icon: '🍎' },
];

const DEFAULTS = () => ({
  profile: {
    sex: 'm',
    age: 25,
    height: 178,
    weight: 75,
    activity: 'mid',
    goal: 'keep',
    waterGoal: 2500,
    custom: null,
  },
  days: {},
  customFoods: [],
  recent: [],
  favorites: [],
  ai: { key: '', model: 'claude-opus-5', autoAdd: false },
  onboarded: false,
});

export const emptyDay = () => ({
  meals: { b: [], l: [], d: [], s: [] },
  workouts: [],
  water: 0,
  weight: null,
});

let data = DEFAULTS();
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = adopt(JSON.parse(raw));
  } catch (e) {
    data = DEFAULTS();
  }
  return data;
}

/** Gespeicherte Daten auf das aktuelle Schema heben. */
function adopt(saved) {
  const merged = merge(DEFAULTS(), saved);
  // Die Tage sind eine freie Map (Datum → Tag) und werden komplett übernommen.
  merged.days = (saved && typeof saved.days === 'object' && saved.days) || {};
  return merged;
}

function merge(base, over) {
  if (over === null || over === undefined) return base;
  if (base === null || base === undefined) return over;
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (typeof base !== 'object') return typeof over === typeof base ? over : base;
  if (typeof over !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(base)) if (k in over) out[k] = merge(base[k], over[k]);
  return out;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
  }
}

export const get = () => data;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commit() {
  save();
  for (const fn of listeners) fn(data);
}

/** Ändert den Zustand und speichert + rendert danach. */
export function update(fn) {
  fn(data);
  commit();
}

// ————————————————————————————————————————————————— Tage

export function day(key) {
  if (!data.days[key]) data.days[key] = emptyDay();
  const d = data.days[key];
  if (!d.meals) d.meals = emptyDay().meals;
  for (const m of MEALS) if (!d.meals[m.id]) d.meals[m.id] = [];
  if (!d.workouts) d.workouts = [];
  if (typeof d.water !== 'number') d.water = 0;
  return d;
}

export const dayOrEmpty = (key) => data.days[key] || emptyDay();

/**
 * @param {object} food  {name, amount, unit, kcal, p, c, f, src}
 */
export function addEntry(dateKey, mealId, food) {
  const entry = { id: uid(), ts: Date.now(), ...food };
  update((d) => {
    day(dateKey).meals[mealId].push(entry);
    if (food.foodId) {
      d.recent = [food.foodId, ...d.recent.filter((x) => x !== food.foodId)].slice(0, 24);
    }
  });
  return entry;
}

export function updateEntry(dateKey, mealId, entryId, patch) {
  update(() => {
    const list = day(dateKey).meals[mealId];
    const i = list.findIndex((e) => e.id === entryId);
    if (i >= 0) list[i] = { ...list[i], ...patch };
  });
}

export function removeEntry(dateKey, mealId, entryId) {
  update(() => {
    const d = day(dateKey);
    d.meals[mealId] = d.meals[mealId].filter((e) => e.id !== entryId);
  });
}

export function moveEntry(dateKey, fromMeal, entryId, toMeal) {
  if (fromMeal === toMeal) return;
  update(() => {
    const d = day(dateKey);
    const entry = d.meals[fromMeal].find((e) => e.id === entryId);
    if (!entry) return;
    d.meals[fromMeal] = d.meals[fromMeal].filter((e) => e.id !== entryId);
    d.meals[toMeal].push(entry);
  });
}

export function addWorkout(dateKey, workout) {
  const w = { id: uid(), ts: Date.now(), ...workout };
  update(() => day(dateKey).workouts.push(w));
  return w;
}

export function removeWorkout(dateKey, id) {
  update(() => {
    const d = day(dateKey);
    d.workouts = d.workouts.filter((w) => w.id !== id);
  });
}

export function setWater(dateKey, ml) {
  update(() => { day(dateKey).water = Math.max(0, ml); });
}

export function setWeight(dateKey, kg) {
  update((d) => {
    day(dateKey).weight = kg;
    if (kg && dateKey === todayKey()) d.profile.weight = kg;
  });
}

// ————————————————————————————————————————————————— Auswertung

export function totals(dateKey) {
  const d = dayOrEmpty(dateKey);
  const entries = MEALS.flatMap((m) => d.meals?.[m.id] || []);
  return {
    kcal: sum(entries, (e) => e.kcal),
    p: sum(entries, (e) => e.p),
    c: sum(entries, (e) => e.c),
    f: sum(entries, (e) => e.f),
    burned: sum(d.workouts || [], (w) => w.kcal),
    water: d.water || 0,
    count: entries.length,
  };
}

export function mealTotals(dateKey, mealId) {
  const list = dayOrEmpty(dateKey).meals?.[mealId] || [];
  return {
    kcal: sum(list, (e) => e.kcal),
    p: sum(list, (e) => e.p),
    c: sum(list, (e) => e.c),
    f: sum(list, (e) => e.f),
    count: list.length,
  };
}

export const goals = () => goalsFor(data.profile);

/** Wie viele Tage am Stück wurde etwas eingetragen (bis gestern zurück)? */
export function streak() {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = totals(key);
    if (t.count > 0) n++;
    else if (i > 0) break; // heute darf noch leer sein
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function weightSeries() {
  return Object.entries(data.days)
    .filter(([, d]) => typeof d.weight === 'number' && d.weight > 0)
    .map(([key, d]) => ({ key, kg: d.weight }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ————————————————————————————————————————————————— Eigene Lebensmittel

export function addCustomFood(food) {
  const f = { id: `own${uid()}`, own: true, ...food };
  update((d) => d.customFoods.push(f));
  return f;
}

export function removeCustomFood(id) {
  update((d) => { d.customFoods = d.customFoods.filter((f) => f.id !== id); });
}

export function toggleFavorite(foodId) {
  update((d) => {
    d.favorites = d.favorites.includes(foodId)
      ? d.favorites.filter((x) => x !== foodId)
      : [foodId, ...d.favorites];
  });
}

// ————————————————————————————————————————————————— Import / Export

export function exportJSON() {
  return JSON.stringify({ app: 'formkurve', version: 1, exported: new Date().toISOString(), data }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const incoming = parsed.data || parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('Datei passt nicht.');
  data = adopt(incoming);
  commit();
}

export function reset() {
  data = DEFAULTS();
  commit();
}
