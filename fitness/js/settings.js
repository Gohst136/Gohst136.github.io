// Profil, Ziele, KI-Zugang und Datenverwaltung.

import { el, num, tap } from './util.js';
import * as state from './state.js';
import { ACTIVITY_LEVELS, GOALS, goalsFor, tdee, bmr } from './nutrition.js';
import { openSheet, toast, confirmSheet, segmented, field, numberInput } from './ui.js';
import { MODELS, testConnection, setKey, setModel } from './ai.js';

export function openProfileSheet() {
  const p = { ...state.get().profile };
  const preview = el('div', { class: 'goal-preview' });

  const draw = () => {
    const g = goalsFor(p);
    preview.replaceChildren(
      el('div', { class: 'gp-main' }, el('b', { text: num(g.kcal) }), el('span', { text: 'kcal / Tag' })),
      el('div', { class: 'gp-macros' },
        el('span', {}, el('i', { style: { background: 'var(--c-protein)' } }), `${num(g.protein)} g Eiweiß`),
        el('span', {}, el('i', { style: { background: 'var(--c-carbs)' } }), `${num(g.carbs)} g Kohlenh.`),
        el('span', {}, el('i', { style: { background: 'var(--c-fat)' } }), `${num(g.fat)} g Fett`)),
      el('p', { class: 'muted tiny', text: `Grundumsatz ${num(bmr(p))} kcal · Gesamtbedarf ${num(tdee(p))} kcal` }));
  };

  const set = (key) => (v) => { p[key] = v; draw(); };

  const activityList = el('div', { class: 'option-list' });
  const drawActivity = () => {
    activityList.replaceChildren(...ACTIVITY_LEVELS.map((lvl) => el('button', {
      class: `option${p.activity === lvl.id ? ' active' : ''}`,
      onclick: () => { tap(); p.activity = lvl.id; drawActivity(); draw(); },
    },
    el('div', {}, el('b', { text: lvl.name }), el('small', { text: lvl.desc })),
    el('span', { class: 'option-tick', text: '✓' }))));
  };
  drawActivity();

  const goalList = el('div', { class: 'option-list' });
  const drawGoal = () => {
    goalList.replaceChildren(...GOALS.map((g) => el('button', {
      class: `option${p.goal === g.id ? ' active' : ''}`,
      onclick: () => { tap(); p.goal = g.id; drawGoal(); draw(); },
    },
    el('div', {}, el('b', { text: g.name }), el('small', { text: g.desc })),
    el('span', { class: 'option-tick', text: '✓' }))));
  };
  drawGoal();

  // Eigene Zielwerte statt Berechnung
  const customBox = el('div', { class: 'custom-goals' });
  const drawCustom = () => {
    customBox.replaceChildren();
    if (!p.custom) return;
    customBox.append(el('div', { class: 'grid-2' },
      field('Kalorien', numberInput(p.custom.kcal, { step: 10, suffix: 'kcal', oninput: (v) => { p.custom.kcal = v; draw(); } })),
      field('Eiweiß', numberInput(p.custom.protein, { step: 5, suffix: 'g', oninput: (v) => { p.custom.protein = v; draw(); } })),
      field('Kohlenhydrate', numberInput(p.custom.carbs, { step: 5, suffix: 'g', oninput: (v) => { p.custom.carbs = v; draw(); } })),
      field('Fett', numberInput(p.custom.fat, { step: 5, suffix: 'g', oninput: (v) => { p.custom.fat = v; draw(); } }))));
  };

  const customToggle = el('button', {
    class: `toggle-row${p.custom ? ' on' : ''}`,
    onclick: () => {
      tap();
      p.custom = p.custom ? null : { ...goalsFor({ ...p, custom: null }) };
      customToggle.classList.toggle('on', Boolean(p.custom));
      drawCustom(); draw();
    },
  }, el('span', { text: 'Zielwerte selbst festlegen' }), el('i', { class: 'switch' }));

  const sheet = openSheet({
    title: 'Profil & Ziel',
    full: true,
    body: [
      preview,
      el('p', { class: 'label-small', text: 'Geschlecht (für den Grundumsatz)' }),
      segmented([
        { value: 'm', label: 'Männlich' },
        { value: 'w', label: 'Weiblich' },
        { value: 'd', label: 'Divers' },
      ], p.sex, set('sex')),
      el('div', { class: 'grid-3' },
        field('Alter', numberInput(p.age, { min: 10, max: 100, suffix: 'J.', oninput: set('age') })),
        field('Größe', numberInput(p.height, { min: 120, max: 230, suffix: 'cm', oninput: set('height') })),
        field('Gewicht', numberInput(p.weight, { min: 30, max: 300, step: 0.1, suffix: 'kg', oninput: set('weight') }))),
      el('p', { class: 'label-small', text: 'Wie aktiv bist du?' }),
      activityList,
      el('p', { class: 'label-small', text: 'Was ist dein Ziel?' }),
      goalList,
      el('p', { class: 'label-small', text: 'Sonstiges' }),
      field('Trinkziel', numberInput(p.waterGoal, { step: 250, suffix: 'ml', oninput: set('waterGoal') })),
      customToggle,
      customBox,
    ],
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => {
        state.update((d) => {
          d.profile = { ...p };
          d.onboarded = true;
        });
        sheet.close();
        toast('Ziel aktualisiert');
      },
    }, 'Speichern'),
  });

  drawCustom();
  draw();
  return sheet;
}

export function openAiSettings() {
  const ai = { ...state.get().ai };
  const status = el('p', { class: 'muted small' });

  const keyInput = el('input', {
    class: 'input', type: 'password', placeholder: 'sk-ant-…',
    value: ai.key, autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const reveal = el('button', {
    class: 'btn btn-ghost btn-sm',
    onclick: () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    },
  }, 'Anzeigen');

  const modelList = el('div', { class: 'option-list' });
  const drawModels = () => {
    modelList.replaceChildren(...MODELS.map((m) => el('button', {
      class: `option${ai.model === m.id ? ' active' : ''}`,
      onclick: () => { tap(); ai.model = m.id; drawModels(); },
    },
    el('div', {}, el('b', { text: m.name }), el('small', { text: m.desc })),
    el('span', { class: 'option-tick', text: '✓' }))));
  };
  drawModels();

  const testBtn = el('button', {
    class: 'btn btn-ghost btn-wide',
    onclick: async () => {
      setKey(keyInput.value);
      setModel(ai.model);
      status.textContent = 'Teste Verbindung …';
      status.className = 'muted small';
      testBtn.disabled = true;
      try {
        await testConnection();
        status.textContent = '✓ Verbindung steht.';
        status.className = 'small ok-text';
      } catch (err) {
        status.textContent = `✕ ${err.message}`;
        status.className = 'small bad-text';
      } finally {
        testBtn.disabled = false;
      }
    },
  }, 'Verbindung testen');

  const sheet = openSheet({
    title: 'Foto-Erkennung',
    subtitle: 'Claude API — dein Schlüssel, dein Konto.',
    full: true,
    body: [
      field('API-Schlüssel', el('div', { class: 'row-inline' }, keyInput, reveal),
        'Wird nur lokal im Browser gespeichert und direkt an api.anthropic.com geschickt.'),
      status,
      testBtn,
      el('p', { class: 'label-small', text: 'Modell' }),
      modelList,
      el('div', { class: 'prose small muted' },
        el('p', {}, 'Jede Analyse kostet ein paar Cent über dein Anthropic-Konto — abgerechnet nach Tokens. Die Fotos werden nicht in der App gespeichert.'),
        el('p', {}, 'Wichtig: Wer Zugriff auf dieses Gerät hat, kommt an den Schlüssel. Nimm einen eigenen Key, den du im Zweifel schnell sperren kannst.')),
      el('button', {
        class: 'btn btn-danger-ghost btn-wide',
        onclick: () => {
          keyInput.value = '';
          setKey('');
          status.textContent = 'Schlüssel entfernt.';
          toast('Schlüssel gelöscht');
        },
      }, 'Schlüssel entfernen'),
    ],
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => {
        setKey(keyInput.value);
        setModel(ai.model);
        sheet.close();
        toast('Gespeichert');
      },
    }, 'Speichern'),
  });
  return sheet;
}

export function openDataSheet() {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      state.importJSON(await file.text());
      toast('Daten importiert');
    } catch (e) {
      toast('Datei konnte nicht gelesen werden.', 'bad');
    }
  });

  const sheet = openSheet({
    title: 'Daten',
    subtitle: 'Alles liegt lokal auf diesem Gerät.',
    body: [
      el('button', {
        class: 'btn btn-ghost btn-wide',
        onclick: () => {
          const blob = new Blob([state.exportJSON()], { type: 'application/json' });
          const a = el('a', {
            href: URL.createObjectURL(blob),
            download: `formkurve-${new Date().toISOString().slice(0, 10)}.json`,
          });
          document.body.append(a); a.click(); a.remove();
          toast('Export erstellt');
        },
      }, '⬇ Daten exportieren'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => fileInput.click() }, '⬆ Daten importieren'),
      fileInput,
      el('button', {
        class: 'btn btn-danger-ghost btn-wide',
        onclick: async () => {
          if (await confirmSheet({
            title: 'Wirklich alles löschen?',
            text: 'Tagebuch, Profil, eigene Lebensmittel und API-Schlüssel werden entfernt.',
            ok: 'Alles löschen',
          })) {
            state.reset();
            sheet.close();
            toast('Zurückgesetzt');
          }
        },
      }, 'Alles zurücksetzen'),
      el('p', { class: 'muted tiny', text: 'Tipp: Vor einem Gerätewechsel exportieren — sonst sind die Daten weg, wenn Safari den Speicher aufräumt.' }),
    ],
  });
  return sheet;
}

/** Kurzer Einstieg beim allerersten Start. */
export function openOnboarding() {
  const sheet = openSheet({
    title: 'Willkommen bei Formkurve',
    subtitle: 'Kalorien tracken, ohne dass es sich nach Buchhaltung anfühlt.',
    body: el('div', { class: 'onboard' },
      el('div', { class: 'onboard-item' }, el('span', { text: '📸' }),
        el('div', {}, el('b', { text: 'Foto statt Suchen' }), el('small', { text: 'Teller abfotografieren — die KI schätzt Portion und Nährwerte.' }))),
      el('div', { class: 'onboard-item' }, el('span', { text: '🎯' }),
        el('div', {}, el('b', { text: 'Ziel aus deinen Werten' }), el('small', { text: 'Grundumsatz, Aktivität und Ziel ergeben deine Tageskalorien.' }))),
      el('div', { class: 'onboard-item' }, el('span', { text: '🔒' }),
        el('div', {}, el('b', { text: 'Bleibt bei dir' }), el('small', { text: 'Kein Konto, kein Server. Alles liegt lokal auf dem iPhone.' })))),
    footer: el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => { sheet.close(); openProfileSheet(); },
    }, 'Profil einrichten'),
  });
  return sheet;
}
