// Kalorien-Erkennung per Foto über die Claude API.
//
// Die App hat keinen Server — der Aufruf geht direkt aus dem Browser an
// api.anthropic.com. Dafür ist der Header `anthropic-dangerous-direct-browser-access`
// nötig, und der API-Schlüssel liegt lokal im Gerät (localStorage).

import { get, update } from './state.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const MODELS = [
  { id: 'claude-opus-5', name: 'Claude Opus 5', desc: 'Beste Erkennung, etwas langsamer' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', desc: 'Guter Kompromiss aus Tempo und Qualität' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: 'Am schnellsten und günstigsten' },
];

const SYSTEM = `Du bist Ernährungsberater und schätzt Nährwerte von Mahlzeiten auf Fotos.

Vorgehen:
1. Benenne das Gericht kurz auf Deutsch.
2. Zerlege es in seine sichtbaren Komponenten (z. B. "Hähnchenbrust", "Reis", "Brokkoli", "Sauce").
3. Schätze für jede Komponente die abgebildete Menge in Gramm bzw. Milliliter. Nutze Größenvergleiche
   im Bild: Teller (Ø 26 cm), Besteck, Gläser, Hände, Verpackungen.
4. Gib kcal, Eiweiß, Kohlenhydrate und Fett für GENAU DIESE geschätzte Menge an — nicht pro 100 g.

Regeln:
- Öl, Butter und Saucen mitrechnen, auch wenn man sie nicht direkt sieht (Gebratenes enthält Fett).
- Lieber realistisch als vorsichtig: unterschätze Fertiggerichte und Restaurantportionen nicht.
- Die Nährwerte einer Komponente müssen rechnerisch zusammenpassen
  (kcal ≈ Eiweiß × 4 + Kohlenhydrate × 4 + Fett × 9, ±10 %).
- Ist auf dem Bild kein Essen zu erkennen, setze "erkannt" auf false und gib eine leere Liste zurück.
- "portion_hinweis": ein kurzer Satz, worauf du deine Mengenschätzung stützt.
- Antworte ausschließlich auf Deutsch.`;

const SCHEMA = {
  type: 'object',
  properties: {
    erkannt: { type: 'boolean' },
    gericht: { type: 'string' },
    portion_hinweis: { type: 'string' },
    sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    komponenten: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          menge: { type: 'number' },
          einheit: { type: 'string', enum: ['g', 'ml'] },
          kcal: { type: 'number' },
          eiweiss: { type: 'number' },
          kohlenhydrate: { type: 'number' },
          fett: { type: 'number' },
        },
        required: ['name', 'menge', 'einheit', 'kcal', 'eiweiss', 'kohlenhydrate', 'fett'],
        additionalProperties: false,
      },
    },
  },
  required: ['erkannt', 'gericht', 'portion_hinweis', 'sicherheit', 'komponenten'],
  additionalProperties: false,
};

export const hasKey = () => Boolean(get().ai.key?.trim());

export function setKey(key) {
  update((d) => { d.ai.key = key.trim(); });
}

export function setModel(model) {
  update((d) => { d.ai.model = model; });
}

/**
 * Verkleinert ein Bild auf maximal 1024 px Kantenlänge und gibt es als JPEG zurück.
 * Große Handyfotos wären sonst unnötig teuer und langsam.
 */
export async function prepareImage(file, maxSide = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', width: w, height: h };
}

export async function prepareFromCanvas(canvas, maxSide = 1024) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(canvas, 0, 0, w, h);
  const dataUrl = out.toDataURL('image/jpeg', 0.82);
  return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', width: w, height: h };
}

class AiError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

async function callClaude(body) {
  const key = get().ai.key?.trim();
  if (!key) throw new AiError('Kein API-Schlüssel hinterlegt.', 'nokey');

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError('Keine Verbindung zur Claude API. Bist du online?', 'network');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || '';
    } catch (e) { /* Antwort war kein JSON */ }
    if (res.status === 401) throw new AiError('API-Schlüssel wird nicht akzeptiert.', 'auth');
    if (res.status === 403) throw new AiError('Dieser Schlüssel darf das Modell nicht nutzen.', 'auth');
    if (res.status === 404) throw new AiError('Modell nicht gefunden. Anderes Modell wählen.', 'model');
    if (res.status === 429) throw new AiError('Zu viele Anfragen. Kurz warten und nochmal probieren.', 'rate');
    if (res.status >= 500) throw new AiError('Die Claude API hat gerade ein Problem.', 'server');
    throw new AiError(detail || `Fehler ${res.status}`, 'http');
  }

  return res.json();
}

function textOf(message) {
  return (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/**
 * Schickt das Foto an Claude und gibt die erkannten Komponenten zurück.
 * @param {{base64:string, mediaType:string}} image
 * @param {string} [hint] Freitext des Nutzers, z. B. "nur die Hälfte gegessen"
 */
export async function analyzeMeal(image, hint = '') {
  const userText = hint.trim()
    ? `Analysiere diese Mahlzeit. Zusatzinfo vom Nutzer: „${hint.trim()}"`
    : 'Analysiere diese Mahlzeit und schätze die Nährwerte der abgebildeten Portion.';

  const message = await callClaude({
    model: get().ai.model || 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: userText },
      ],
    }],
  });

  if (message.stop_reason === 'refusal') {
    throw new AiError('Claude hat die Analyse abgelehnt. Probier ein anderes Foto.', 'refusal');
  }

  const raw = textOf(message);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < 0) throw new AiError('Antwort konnte nicht gelesen werden.', 'parse');
    parsed = JSON.parse(raw.slice(start, end + 1));
  }

  const komponenten = (parsed.komponenten || []).map((k) => ({
    name: String(k.name || 'Zutat'),
    amount: Math.max(0, Math.round(Number(k.menge) || 0)),
    unit: k.einheit === 'ml' ? 'ml' : 'g',
    kcal: Math.max(0, Math.round(Number(k.kcal) || 0)),
    p: Math.max(0, Math.round((Number(k.eiweiss) || 0) * 10) / 10),
    c: Math.max(0, Math.round((Number(k.kohlenhydrate) || 0) * 10) / 10),
    f: Math.max(0, Math.round((Number(k.fett) || 0) * 10) / 10),
  })).filter((k) => k.amount > 0 || k.kcal > 0);

  return {
    ok: Boolean(parsed.erkannt) && komponenten.length > 0,
    dish: parsed.gericht || 'Mahlzeit',
    note: parsed.portion_hinweis || '',
    confidence: parsed.sicherheit || 'mittel',
    items: komponenten,
    usage: message.usage || null,
  };
}

/** Kleiner Testaufruf für die Einstellungen. */
export async function testConnection() {
  const message = await callClaude({
    model: get().ai.model || 'claude-opus-5',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
  });
  return textOf(message).slice(0, 40) || 'OK';
}
