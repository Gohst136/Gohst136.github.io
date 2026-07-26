// Grundumsatz, Tagesbedarf, Makroverteilung und Kalorienverbrauch beim Sport.

import { clamp, dec } from './util.js';

export const ACTIVITY_LEVELS = [
  { id: 'low', factor: 1.2, name: 'Sitzend', desc: 'Büro, kaum Bewegung' },
  { id: 'light', factor: 1.375, name: 'Leicht aktiv', desc: '1–2× Sport pro Woche' },
  { id: 'mid', factor: 1.55, name: 'Aktiv', desc: '3–5× Sport pro Woche' },
  { id: 'high', factor: 1.725, name: 'Sehr aktiv', desc: '6–7× Sport pro Woche' },
  { id: 'extreme', factor: 1.9, name: 'Extrem aktiv', desc: 'Körperliche Arbeit + Training' },
];

export const GOALS = [
  { id: 'lose', name: 'Abnehmen', delta: -500, protein: 2.0, desc: '≈ 0,5 kg pro Woche' },
  { id: 'lose_slow', name: 'Langsam abnehmen', delta: -300, protein: 1.9, desc: '≈ 0,3 kg pro Woche' },
  { id: 'keep', name: 'Gewicht halten', delta: 0, protein: 1.6, desc: 'Bedarf decken' },
  { id: 'gain', name: 'Muskeln aufbauen', delta: 300, protein: 1.8, desc: '≈ 0,25 kg pro Woche' },
];

/** Grundumsatz nach Mifflin-St Jeor. */
export function bmr({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  if (sex === 'm') return base + 5;
  if (sex === 'w') return base - 161;
  return base - 78; // Mittelwert, wenn nichts anderes angegeben ist
}

export function tdee(profile) {
  const lvl = ACTIVITY_LEVELS.find((l) => l.id === profile.activity) || ACTIVITY_LEVELS[1];
  return bmr(profile) * lvl.factor;
}

/**
 * Tagesziel aus dem Profil. Eiweiß nach Körpergewicht, Fett auf 27 % der
 * Kalorien, der Rest sind Kohlenhydrate.
 */
export function goalsFor(profile) {
  if (profile.custom) return { ...profile.custom, water: profile.waterGoal || 2500 };

  const goal = GOALS.find((g) => g.id === profile.goal) || GOALS[2];
  const total = clamp(Math.round((tdee(profile) + goal.delta) / 10) * 10, 1200, 6000);
  const protein = Math.round(profile.weight * goal.protein);
  const fat = Math.round((total * 0.27) / 9);
  const carbs = Math.max(0, Math.round((total - protein * 4 - fat * 9) / 4));
  return { kcal: total, protein, carbs, fat, water: profile.waterGoal || 2500 };
}

// MET-Werte: Kalorien = MET × 3,5 × kg / 200 × Minuten
//
// Vierter Eintrag (optional):
//   dist  — für diese Sportart lässt sich eine Strecke eintragen
//   speed — Tempo bestimmt den MET-Wert (Tabelle unten); ohne das bleibt er fix
//   pace  — wie das Tempo angezeigt wird: min/km, km/h oder min/100 m
const WALK = { dist: true, speed: 'walk', pace: 'km' };
const RUN = { dist: true, speed: 'run', pace: 'km' };
const BIKE = { dist: true, speed: 'bike', pace: 'kmh' };
const DIST_KM = { dist: true, pace: 'km' };
const DIST_KMH = { dist: true, pace: 'kmh' };

export const ACTIVITIES = [
  ['Spazieren gehen', 3.0, '🚶', WALK],
  ['Zügig gehen', 4.3, '🚶', WALK],
  ['Wandern', 6.0, '🥾', DIST_KM],
  ['Joggen, locker', 7.0, '🏃', RUN],
  ['Laufen, 10 km/h', 9.8, '🏃', RUN],
  ['Laufen, 12 km/h', 11.8, '🏃', RUN],
  ['Radfahren, gemütlich', 5.8, '🚴', BIKE],
  ['Radfahren, zügig', 8.5, '🚴', BIKE],
  ['Mountainbike', 8.5, '🚵', DIST_KMH],
  ['Schwimmen, locker', 5.8, '🏊', { dist: true, pace: 'swim' }],
  ['Schwimmen, zügig', 9.8, '🏊', { dist: true, pace: 'swim' }],
  ['Krafttraining, moderat', 3.5, '🏋️'],
  ['Krafttraining, intensiv', 6.0, '🏋️'],
  ['HIIT / Zirkeltraining', 8.0, '🔥'],
  ['Crosstrainer', 7.0, '🏃', DIST_KMH],
  ['Rudern', 7.0, '🚣', DIST_KMH],
  ['Seilspringen', 11.0, '🪢'],
  ['Yoga', 2.5, '🧘'],
  ['Pilates', 3.0, '🧘'],
  ['Fußball', 7.0, '⚽'],
  ['Basketball', 6.5, '🏀'],
  ['Handball', 8.0, '🤾'],
  ['Volleyball', 4.0, '🏐'],
  ['Tennis', 7.3, '🎾'],
  ['Boxen / Kampfsport', 9.0, '🥊'],
  ['Klettern', 8.0, '🧗'],
  ['Tanzen', 5.0, '💃'],
  ['Skifahren', 7.0, '⛷️', DIST_KMH],
  ['Inline-Skaten', 7.5, '🛼', { dist: true, speed: 'skate', pace: 'kmh' }],
  ['Treppensteigen', 8.0, '🪜'],
  ['Gartenarbeit', 3.8, '🌱'],
  ['Hausarbeit', 3.0, '🧹'],
].map(([name, met, icon, opts], i) => ({ id: `act${i}`, name, met, icon, ...opts }));

// Geschwindigkeit (km/h) → MET, angelehnt ans Compendium of Physical Activities.
// Dazwischen wird linear interpoliert, außerhalb gilt der Randwert.
const SPEED_MET = {
  walk: [[3, 2.5], [4, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8, 8.0]],
  run: [[6, 6.0], [8, 8.3], [9.7, 9.8], [11.3, 11.0], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5], [19, 17.5]],
  bike: [[10, 4.0], [16, 6.8], [19, 8.0], [22, 10.0], [25, 12.0], [30, 14.0], [35, 15.8]],
  skate: [[10, 7.0], [15, 9.0], [20, 12.3], [24, 14.0]],
};

function metForSpeed(family, kmh) {
  const table = SPEED_MET[family];
  if (!table || !(kmh > 0)) return null;
  if (kmh <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (kmh >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i - 1];
    const [x2, y2] = table[i];
    if (kmh <= x2) return y1 + (y2 - y1) * ((kmh - x1) / (x2 - x1));
  }
  return last[1];
}

/**
 * Der MET-Wert, mit dem gerechnet wird. Sind Strecke und Dauer bekannt und hat
 * die Sportart eine Tempotabelle, zählt das tatsächliche Tempo — sonst der
 * Standardwert der Aktivität.
 */
export function metFor(activity, minutes, km) {
  if (!activity?.speed || !(km > 0) || !(minutes > 0)) return activity?.met || 0;
  return metForSpeed(activity.speed, (km / minutes) * 60) ?? activity.met;
}

/** Wurde der MET-Wert gerade durchs Tempo bestimmt statt aus dem Standard? */
export function usesSpeed(activity, minutes, km) {
  return Boolean(activity?.speed) && km > 0 && minutes > 0;
}

function mmss(totalSeconds) {
  const t = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** „5:30 min/km", „18,2 km/h" oder „2:05 min/100 m" — je nach Sportart. */
export function paceLabel(activity, km, minutes) {
  if (!(km > 0) || !(minutes > 0)) return '';
  if (activity.pace === 'kmh') return `${dec((km / minutes) * 60)} km/h`;
  if (activity.pace === 'swim') return `${mmss((minutes * 60) / (km * 10))} min/100 m`;
  return `${mmss((minutes * 60) / km)} min/km`;
}

export function burnedKcal(met, minutes, weight) {
  return Math.round((met * 3.5 * weight / 200) * minutes);
}

/** Grobe BMI-Einordnung fürs Profil. */
export function bmiInfo(weight, heightCm) {
  const h = heightCm / 100;
  const bmi = weight / (h * h);
  let label = 'Normalgewicht';
  if (bmi < 18.5) label = 'Untergewicht';
  else if (bmi >= 30) label = 'Adipositas';
  else if (bmi >= 25) label = 'Übergewicht';
  return { bmi, label };
}
