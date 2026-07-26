// Der Foto-Flow: aufnehmen → von Claude schätzen lassen → prüfen → eintragen.

import { el, num, dec, tap, clamp, sum } from './util.js';
import * as state from './state.js';
import { MEALS } from './state.js';
import { openSheet, toast, segmented, field } from './ui.js';
import { captureImage } from './camera.js';
import { analyzeMeal, hasKey } from './ai.js';
import { openAiSettings } from './settings.js';

/** Mahlzeit nach Tageszeit vorschlagen. */
export function guessMeal() {
  const h = new Date().getHours();
  if (h < 10.5) return 'b';
  if (h < 15) return 'l';
  if (h < 21) return 'd';
  return 's';
}

const CONFIDENCE = {
  hoch: { label: 'Sichere Schätzung', cls: 'ok' },
  mittel: { label: 'Mittlere Sicherheit', cls: 'warn' },
  niedrig: { label: 'Grobe Schätzung', cls: 'bad' },
};

export async function startScan(dateKey, mealId = guessMeal()) {
  if (!hasKey()) {
    openKeyHint();
    return;
  }
  const image = await captureImage();
  if (!image) return;
  runAnalysis(image, dateKey, mealId);
}

function openKeyHint() {
  const sheet = openSheet({
    title: 'Foto-Erkennung einrichten',
    subtitle: 'Die Schätzung läuft über die Claude API von Anthropic.',
    body: el('div', { class: 'prose' },
      el('p', {}, 'Formkurve hat keinen eigenen Server. Für die Kalorien-Erkennung brauchst du einen eigenen API-Schlüssel — das Foto geht dann direkt von deinem iPhone an Anthropic.'),
      el('ol', {},
        el('li', {}, 'Auf console.anthropic.com einen Account anlegen'),
        el('li', {}, 'Unter „API Keys" einen Schlüssel erzeugen'),
        el('li', {}, 'Hier einfügen — er bleibt lokal auf dem Gerät')),
      el('p', { class: 'muted' }, 'Ohne Schlüssel funktioniert alles andere ganz normal: Suche, Tagebuch, Training und Ziele.')),
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => { sheet.close(); openAiSettings(); },
    }, 'Schlüssel hinterlegen'),
  });
}

function runAnalysis(image, dateKey, mealId) {
  const sheet = openSheet({ full: true, body: loadingView(image) });

  analyzeMeal(image)
    .then((result) => {
      tap(14);
      if (!result.ok) {
        sheet.setBody(errorView(image, 'Auf dem Foto war kein Essen zu erkennen.', () => {
          sheet.close(); startScan(dateKey, mealId);
        }));
        return;
      }
      sheet.setBody(resultView({ image, result, dateKey, mealId, sheet }));
    })
    .catch((err) => {
      sheet.setBody(errorView(image, err.message || 'Analyse fehlgeschlagen.', () => {
        sheet.close(); startScan(dateKey, mealId);
      }, err.kind));
    });
}

function loadingView(image) {
  return [
    el('div', { class: 'shot' }, el('img', { src: image.dataUrl, alt: 'Aufnahme' }),
      el('div', { class: 'shot-scan' })),
    el('div', { class: 'analyzing' },
      el('div', { class: 'spinner' }),
      el('h2', { text: 'Claude schaut sich das an …' }),
      el('p', { class: 'muted', text: 'Gericht erkennen, Portion abschätzen, Nährwerte berechnen.' })),
  ];
}

function errorView(image, message, retry, kind) {
  return [
    el('div', { class: 'shot' }, el('img', { src: image.dataUrl, alt: 'Aufnahme' })),
    el('div', { class: 'analyzing' },
      el('div', { class: 'big-icon', text: '🤔' }),
      el('h2', { text: message }),
      kind === 'auth' || kind === 'nokey'
        ? el('button', { class: 'btn btn-ghost', onclick: openAiSettings }, 'API-Schlüssel prüfen')
        : null),
    el('div', { class: 'foot-row' },
      el('button', { class: 'btn btn-primary btn-wide', onclick: retry }, 'Neues Foto')),
  ];
}

function resultView({ image, result, dateKey, mealId, sheet }) {
  // Arbeitskopie — der Nutzer darf alles korrigieren, bevor es gespeichert wird.
  const items = result.items.map((it) => ({ ...it, id: Math.random().toString(36).slice(2) }));
  let targetMeal = mealId;

  const listBox = el('div', { class: 'list list-scan' });
  const totalBox = el('div', { class: 'scan-total' });

  const recalc = () => {
    const t = {
      kcal: sum(items, (i) => i.kcal),
      p: sum(items, (i) => i.p),
      c: sum(items, (i) => i.c),
      f: sum(items, (i) => i.f),
    };
    totalBox.replaceChildren(
      el('div', { class: 'st-left' },
        el('b', { text: num(t.kcal) }), el('span', { text: 'kcal gesamt' })),
      el('div', { class: 'st-macros' },
        el('span', {}, el('i', { style: { background: 'var(--c-protein)' } }), `${dec(t.p)} g`),
        el('span', {}, el('i', { style: { background: 'var(--c-carbs)' } }), `${dec(t.c)} g`),
        el('span', {}, el('i', { style: { background: 'var(--c-fat)' } }), `${dec(t.f)} g`)));
  };

  const draw = () => {
    listBox.replaceChildren();
    items.forEach((item) => {
      const per = item.amount > 0
        ? { kcal: item.kcal / item.amount, p: item.p / item.amount, c: item.c / item.amount, f: item.f / item.amount }
        : { kcal: 0, p: 0, c: 0, f: 0 };

      const kcalOut = el('b', { text: `${num(item.kcal)} kcal` });
      const amountInput = el('input', {
        class: 'input input-mini', type: 'number', inputmode: 'numeric',
        value: String(item.amount), min: '0', step: '5',
      });

      const apply = (v) => {
        item.amount = clamp(Math.round(v), 0, 5000);
        item.kcal = Math.round(per.kcal * item.amount);
        item.p = Math.round(per.p * item.amount * 10) / 10;
        item.c = Math.round(per.c * item.amount * 10) / 10;
        item.f = Math.round(per.f * item.amount * 10) / 10;
        amountInput.value = String(item.amount);
        kcalOut.textContent = `${num(item.kcal)} kcal`;
        recalc();
      };
      amountInput.addEventListener('input', () => apply(Number(amountInput.value) || 0));

      listBox.append(el('div', { class: 'scan-item' },
        el('div', { class: 'si-head' },
          el('span', { class: 'si-name', text: item.name }),
          el('button', {
            class: 'si-del', 'aria-label': 'Entfernen',
            onclick: () => {
              const i = items.indexOf(item);
              if (i >= 0) items.splice(i, 1);
              tap();
              draw(); recalc();
            },
          }, '✕')),
        el('div', { class: 'si-row' },
          el('button', { class: 'step step-sm', onclick: () => { tap(); apply(item.amount - 10); } }, '−'),
          el('div', { class: 'input-suffix' }, amountInput, el('span', { text: item.unit })),
          el('button', { class: 'step step-sm', onclick: () => { tap(); apply(item.amount + 10); } }, '＋'),
          kcalOut)));
    });
    if (!items.length) listBox.append(el('p', { class: 'empty', text: 'Alle Positionen entfernt.' }));
  };

  const conf = CONFIDENCE[result.confidence] || CONFIDENCE.mittel;

  const hintInput = el('input', {
    class: 'input', type: 'text',
    placeholder: 'z. B. „nur die Hälfte gegessen", „mit extra Käse"',
  });

  const refine = async () => {
    const hint = hintInput.value.trim();
    if (!hint) { toast('Schreib kurz, was anders ist.', 'warn'); return; }
    sheet.setBody(loadingView(image));
    try {
      const better = await analyzeMeal(image, hint);
      if (!better.ok) throw new Error('Keine Zutaten erkannt.');
      sheet.setBody(resultView({ image, result: better, dateKey, mealId: targetMeal, sheet }));
    } catch (err) {
      sheet.setBody(errorView(image, err.message || 'Hat nicht geklappt.', () => {
        sheet.setBody(resultView({ image, result, dateKey, mealId: targetMeal, sheet }));
      }, err.kind));
    }
  };

  draw();
  recalc();

  return [
    el('div', { class: 'shot shot-sm' }, el('img', { src: image.dataUrl, alt: 'Aufnahme' })),
    el('div', { class: 'scan-head' },
      el('h2', { text: result.dish }),
      el('span', { class: `badge ${conf.cls}`, text: conf.label })),
    result.note && el('p', { class: 'muted small', text: result.note }),
    totalBox,
    listBox,
    el('details', { class: 'refine' },
      el('summary', { text: 'Schätzung anpassen lassen' }),
      el('div', { class: 'refine-body' },
        hintInput,
        el('button', { class: 'btn btn-ghost btn-wide', onclick: refine }, 'Nochmal schätzen'))),
    el('p', { class: 'label-small', text: 'Als welche Mahlzeit?' }),
    segmented(MEALS.map((m) => ({ value: m.id, label: m.name.replace('essen', '') })), targetMeal, (v) => { targetMeal = v; }),
    el('p', { class: 'muted tiny', text: 'Schätzwerte einer KI — gut für den Alltag, kein Laborwert. Korrigier ruhig, was nicht passt.' }),
    el('div', { class: 'foot-row foot-sticky' },
      el('button', {
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          if (!items.length) { toast('Nichts zum Eintragen.', 'warn'); return; }
          for (const it of items) {
            state.addEntry(dateKey, targetMeal, {
              name: it.name, amount: it.amount, unit: it.unit,
              kcal: it.kcal, p: it.p, c: it.c, f: it.f, src: 'ai',
            });
          }
          tap(16);
          sheet.close();
          toast(`${items.length} Positionen eingetragen`);
        },
      }, 'Alles eintragen')),
  ];
}
