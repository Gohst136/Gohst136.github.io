// Bausteine der Oberfläche: Sheets von unten, Toasts, Ringe, Balken, Diagramme.

import { $, el, clamp, tap, num } from './util.js';

// ————————————————————————————————————————————————— Sheets

const stack = [];

export function openSheet({ title, subtitle, body, footer, full = false, onClose } = {}) {
  const host = $('#sheet-host');
  const content = el('div', { class: 'sheet-body' });
  for (const node of [body].flat()) if (node) content.append(node);

  const sheet = el('div', { class: `sheet${full ? ' sheet-full' : ''}` },
    el('div', { class: 'sheet-grip' }),
    (title || subtitle) && el('div', { class: 'sheet-head' },
      title && el('h2', { text: title }),
      subtitle && el('p', { text: subtitle })),
    content,
    footer && el('div', { class: 'sheet-foot' }, footer));

  const backdrop = el('div', { class: 'sheet-backdrop' });
  const wrap = el('div', { class: 'sheet-wrap' }, backdrop, sheet);
  host.append(wrap);
  host.classList.add('open');

  const api = {
    close() {
      if (api.closed) return;
      api.closed = true;
      wrap.classList.add('closing');
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      setTimeout(() => {
        wrap.remove();
        if (!host.children.length) host.classList.remove('open');
      }, 260);
      onClose?.();
    },
    setBody(nodes) {
      content.replaceChildren(...[nodes].flat().filter(Boolean));
    },
    el: sheet,
  };
  stack.push(api);

  backdrop.addEventListener('click', () => api.close());

  // Nach unten wischen schließt das Sheet.
  let startY = null; let dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (content.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (startY === null) return;
    sheet.style.transform = '';
    if (dy > 110) api.close();
    startY = null;
  });

  requestAnimationFrame(() => wrap.classList.add('shown'));
  return api;
}

export function closeTopSheet() {
  stack[stack.length - 1]?.close();
}

export function confirmSheet({ title, text, ok = 'Löschen', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const sheet = openSheet({
      title,
      subtitle: text,
      body: el('div', { class: 'confirm-actions' },
        el('button', {
          class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          onclick: () => { finish(true); sheet.close(); },
        }, ok),
        el('button', { class: 'btn btn-ghost', onclick: () => { finish(false); sheet.close(); } }, 'Abbrechen')),
      onClose: () => finish(false),
    });
  });
}

// ————————————————————————————————————————————————— Toast

let toastTimer = null;

export function toast(message, kind = '') {
  const host = $('#toast-host');
  const node = el('div', { class: `toast ${kind}`, text: message });
  host.replaceChildren(node);
  requestAnimationFrame(() => node.classList.add('shown'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('shown');
    setTimeout(() => node.remove(), 300);
  }, 2600);
}

// ————————————————————————————————————————————————— Ring

const R = 62;
const CIRC = 2 * Math.PI * R;

export function calorieRing() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 150 150');
  svg.setAttribute('class', 'ring');

  const mk = (cls, extra = {}) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '75'); c.setAttribute('cy', '75'); c.setAttribute('r', String(R));
    c.setAttribute('fill', 'none');
    c.setAttribute('class', cls);
    for (const [k, v] of Object.entries(extra)) c.setAttribute(k, v);
    return c;
  };

  const track = mk('ring-track');
  const fill = mk('ring-fill', { 'stroke-linecap': 'round' });
  const over = mk('ring-over', { 'stroke-linecap': 'round' });
  fill.style.strokeDasharray = `0 ${CIRC}`;
  over.style.strokeDasharray = `0 ${CIRC}`;
  svg.append(track, fill, over);

  return {
    svg,
    set(pct) {
      const p = clamp(pct, 0, 1);
      const extra = clamp(pct - 1, 0, 1);
      fill.style.strokeDasharray = `${p * CIRC} ${CIRC}`;
      over.style.strokeDasharray = `${extra * CIRC} ${CIRC}`;
      // Runde Enden zeichnen sonst auch bei Länge 0 einen Punkt.
      fill.style.opacity = p > 0.002 ? '1' : '0';
      over.style.opacity = extra > 0.002 ? '1' : '0';
      svg.classList.toggle('is-over', pct > 1);
    },
  };
}

// ————————————————————————————————————————————————— Makro-Balken

export function macroBar(label, value, goal, cssVar) {
  const pct = goal > 0 ? clamp(value / goal, 0, 1.2) : 0;
  return el('div', { class: 'macro' },
    el('div', { class: 'macro-top' },
      el('span', { class: 'macro-label' }, label),
      el('span', { class: 'macro-val' },
        el('b', {}, num(value)),
        ` / ${num(goal)} g`)),
    el('div', { class: 'macro-track' },
      el('i', {
        style: { width: `${Math.min(100, pct * 100)}%`, background: `var(${cssVar})` },
      })));
}

// ————————————————————————————————————————————————— Balkendiagramm

/**
 * @param {{label:string, value:number, highlight?:boolean}[]} items
 */
export function barChart(items, { goal = 0, unit = 'kcal' } = {}) {
  const max = Math.max(goal * 1.1, ...items.map((i) => i.value), 1);
  const bars = items.map((it) => {
    const h = clamp(it.value / max, 0, 1) * 100;
    return el('div', { class: `chart-col${it.highlight ? ' is-now' : ''}` },
      el('div', { class: 'chart-bar-wrap' },
        el('div', {
          class: 'chart-bar',
          style: { height: `${Math.max(it.value > 0 ? 4 : 1.5, h)}%` },
          title: `${num(it.value)} ${unit}`,
        })),
      el('span', { class: 'chart-x', text: it.label }));
  });
  const chart = el('div', { class: 'chart' }, ...bars);
  if (goal > 0) {
    const y = clamp(goal / max, 0, 1) * 100;
    chart.append(el('div', { class: 'chart-goal', style: { bottom: `calc(${y}% + 18px)` } },
      el('span', { text: `${num(goal)}` })));
  }
  return chart;
}

/** Gewichtsverlauf als Linie. */
export function lineChart(points) {
  const ns = 'http://www.w3.org/2000/svg';
  const w = 320; const h = 120; const pad = 10;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'linechart');
  if (points.length < 2) return svg;

  const vals = points.map((p) => p.kg);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const span = Math.max(max - min, 1);
  const x = (i) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', `${d} L${x(points.length - 1)},${h} L${x(0)},${h} Z`);
  area.setAttribute('class', 'line-area');
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('class', 'line-path');
  svg.append(area, line);

  points.forEach((p, i) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p.kg)); c.setAttribute('r', 2.8);
    c.setAttribute('class', 'line-dot');
    svg.append(c);
  });
  return svg;
}

// ————————————————————————————————————————————————— Formelemente

export function segmented(options, value, onChange) {
  const wrap = el('div', { class: 'segmented' });
  for (const opt of options) {
    const b = el('button', {
      class: `seg${opt.value === value ? ' active' : ''}`,
      type: 'button',
      onclick: () => {
        tap();
        [...wrap.children].forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        onChange(opt.value);
      },
    }, opt.label);
    wrap.append(b);
  }
  return wrap;
}

export function field(label, input, hint) {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label', text: label }),
    input,
    hint && el('span', { class: 'field-hint', text: hint }));
}

export function numberInput(value, { min = 0, max = 9999, step = 1, suffix = '', oninput } = {}) {
  const input = el('input', {
    class: 'input', type: 'number', inputmode: 'decimal',
    value: String(value), min, max, step,
    oninput: (e) => oninput?.(Number(e.target.value)),
  });
  if (!suffix) return input;
  return el('div', { class: 'input-suffix' }, input, el('span', { text: suffix }));
}
