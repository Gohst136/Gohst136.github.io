// Grundumsatz, Tagesbedarf, Makroverteilung und Kalorienverbrauch beim Sport.

import { clamp } from './util.js';

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
export const ACTIVITIES = [
  ['Spazieren gehen', 3.0, '🚶'],
  ['Zügig gehen', 4.3, '🚶'],
  ['Wandern', 6.0, '🥾'],
  ['Joggen, locker', 7.0, '🏃'],
  ['Laufen, 10 km/h', 9.8, '🏃'],
  ['Laufen, 12 km/h', 11.8, '🏃'],
  ['Radfahren, gemütlich', 5.8, '🚴'],
  ['Radfahren, zügig', 8.5, '🚴'],
  ['Mountainbike', 8.5, '🚵'],
  ['Schwimmen, locker', 5.8, '🏊'],
  ['Schwimmen, zügig', 9.8, '🏊'],
  ['Krafttraining, moderat', 3.5, '🏋️'],
  ['Krafttraining, intensiv', 6.0, '🏋️'],
  ['HIIT / Zirkeltraining', 8.0, '🔥'],
  ['Crosstrainer', 7.0, '🏃'],
  ['Rudern', 7.0, '🚣'],
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
  ['Skifahren', 7.0, '⛷️'],
  ['Inline-Skaten', 7.5, '🛼'],
  ['Treppensteigen', 8.0, '🪜'],
  ['Gartenarbeit', 3.8, '🌱'],
  ['Hausarbeit', 3.0, '🧹'],
].map(([name, met, icon], i) => ({ id: `act${i}`, name, met, icon }));

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
