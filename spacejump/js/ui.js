// Bildschirme, HUD, Anzugauswahl, Missionen, Einstellungen.

import { SKINS, skinById, skinPortrait } from './skins.js';
import { makePlatform, updatePlatform, drawPlatform, TYPES } from './platforms.js';
import * as store from './state.js';
import { fmt, clamp } from './util.js';
import { sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SCREENS = ['title', 'skins', 'missions', 'help', 'settings', 'pause', 'over'];

const LEGEND_ORDER = ['normal', 'moving', 'ice', 'boost', 'phase', 'magnet', 'plasma', 'portal', 'orbit'];

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.current = 'title';
    this.previewSkin = store.get().skin;
    this.portraits = [];
    this.legend = [];
    this.animT = 0;
    this.lastBuffs = '';
    this.build();
    this.bind();
    this.refresh();
    requestAnimationFrame((t) => this.tick(t));
  }

  // ------------------------------------------------------------- Aufbauen
  build() {
    // Anzug-Karten
    const grid = $('#skin-grid');
    grid.innerHTML = '';
    this.portraits = SKINS.map((skin) => {
      const card = document.createElement('button');
      card.className = 'skin-card';
      card.dataset.skin = skin.id;
      const cv = document.createElement('canvas');
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = skin.name;
      const price = document.createElement('div');
      price.className = 'price';
      card.append(cv, nm, price);
      grid.append(card);
      return { skin, card, canvas: cv, price };
    });

    // Plattform-Legende
    const legend = $('#plat-legend');
    legend.innerHTML = '';
    this.legend = LEGEND_ORDER.map((type) => {
      const row = document.createElement('div');
      row.className = 'plat-row';
      const cv = document.createElement('canvas');
      const txt = document.createElement('div');
      txt.innerHTML = `<b>${TYPES[type].label}</b><span>${TYPES[type].hint}</span>`;
      row.append(cv, txt);
      legend.append(row);
      const p = makePlatform(type, 13, 9, 70, 96);
      if (type === 'orbit') { p.cx = 48; p.cy = 17; p.rad = 17; }
      if (type === 'moving') p.vx = 14;
      return { type, canvas: cv, plat: p };
    });

    // Missionen
    const list = $('#mission-list');
    list.innerHTML = '';
    this.missionRows = store.MISSIONS.map((m) => {
      const row = document.createElement('div');
      row.className = 'mission';
      row.innerHTML = `<div class="tick">✓</div>
        <div class="txt"><b>${m.name}</b><span>${m.desc}</span></div>
        <div class="rw"><span class="coin-dot"></span>${m.reward}</div>`;
      list.append(row);
      return { m, row };
    });
  }

  bind() {
    document.addEventListener('click', (ev) => {
      const nav = ev.target.closest('[data-nav]');
      if (nav) { sfx.ui(); this.show(nav.dataset.nav); return; }

      const act = ev.target.closest('[data-action]');
      if (act) {
        sfx.ui();
        const a = act.dataset.action;
        if (a === 'play') this.hooks.onPlay?.();
        if (a === 'resume') this.hooks.onResume?.();
        if (a === 'restart') this.hooks.onRestart?.();
        if (a === 'quit') this.hooks.onQuit?.();
        return;
      }

      const card = ev.target.closest('.skin-card');
      if (card) { this.pickSkin(card.dataset.skin); return; }

      const tog = ev.target.closest('[data-toggle]');
      if (tog) {
        const key = tog.dataset.toggle;
        const val = !store.get().settings[key];
        store.setSetting(key, val);
        tog.classList.toggle('on', val);
        sfx.ui();
        this.hooks.onSetting?.(key, val);
        return;
      }

      const ctl = ev.target.closest('[data-control]');
      if (ctl) {
        store.setSetting('control', ctl.dataset.control);
        this.refreshSettings();
        sfx.ui();
        this.hooks.onSetting?.('control', ctl.dataset.control);
      }
    });

    $('#btn-pause').addEventListener('click', () => { sfx.ui(); this.hooks.onPause?.(); });

    $('#btn-tilt-permission').addEventListener('click', async () => {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          const res = await DOE.requestPermission();
          this.toast(res === 'granted' ? 'Neigungssensor freigegeben.' : 'Zugriff abgelehnt.');
          if (res === 'granted') { store.setSetting('control', 'tilt'); this.refreshSettings(); this.hooks.onSetting?.('control', 'tilt'); }
        } catch (e) {
          this.toast('Der Sensor lässt sich hier nicht freigeben.');
        }
      } else {
        this.toast('Dieses Gerät fragt nicht nach — Neigen einfach auswählen.');
      }
    });

    $('#btn-reset').addEventListener('click', () => {
      if (this.resetArmed) {
        store.resetAll();
        this.previewSkin = 'pionier';
        this.refresh();
        this.toast('Spielstand gelöscht.');
        this.resetArmed = false;
        $('#btn-reset').textContent = 'Spielstand löschen';
      } else {
        this.resetArmed = true;
        $('#btn-reset').textContent = 'Wirklich? Nochmal tippen';
        setTimeout(() => {
          this.resetArmed = false;
          $('#btn-reset').textContent = 'Spielstand löschen';
        }, 4000);
      }
    });
  }

  // -------------------------------------------------------------- Anzeigen
  show(name) {
    for (const s of SCREENS) {
      $(`#screen-${s}`)?.classList.toggle('show', s === name);
    }
    this.current = name;
    $('#hud').classList.toggle('hidden', name !== 'pause');
    if (name === 'title') this.refreshTitle();
    if (name === 'skins') { this.refreshSkins(); this.pickSkin(store.get().skin, true); }
    if (name === 'missions') this.refreshMissions();
    if (name === 'settings') this.refreshSettings();
  }

  hideAll() {
    for (const s of SCREENS) $(`#screen-${s}`)?.classList.remove('show');
    this.current = null;
    $('#hud').classList.remove('hidden');
  }

  refresh() {
    this.refreshTitle();
    this.refreshSkins();
    this.refreshMissions();
    this.refreshSettings();
  }

  refreshTitle() {
    const d = store.get();
    $('#t-best').textContent = fmt(d.best);
    $('#t-sector').textContent = d.bestSector;
    $('#t-coins').textContent = fmt(d.coins);
  }

  refreshSkins() {
    const d = store.get();
    $('#skins-coins').textContent = fmt(d.coins);
    for (const p of this.portraits) {
      const owned = d.owned.includes(p.skin.id);
      p.card.classList.toggle('locked', !owned);
      p.card.classList.toggle('sel', d.skin === p.skin.id);
      if (owned) {
        p.price.className = 'price owned';
        p.price.textContent = d.skin === p.skin.id ? 'aktiv' : 'bereit';
      } else {
        p.price.className = 'price';
        p.price.innerHTML = `<span class="coin-dot"></span>${fmt(p.skin.cost)}`;
      }
    }
    this.renderDetail();
  }

  pickSkin(id, silent = false) {
    const d = store.get();
    const skin = skinById(id);
    if (this.previewSkin !== id) {
      this.previewSkin = id;
      if (!silent) sfx.ui();
      this.renderDetail();
      this.refreshSkins();
      return;
    }
    // Zweiter Tipp auf dieselbe Karte: kaufen bzw. anlegen
    if (d.owned.includes(id)) {
      if (d.skin !== id) {
        store.selectSkin(id);
        sfx.buy();
        this.toast(`${skin.name} angelegt.`);
        this.hooks.onSelectSkin?.(skin);
      }
    } else if (d.coins >= skin.cost) {
      store.addCoins(-skin.cost);
      store.ownSkin(id);
      store.selectSkin(id);
      sfx.buy();
      this.toast(`${skin.name} freigeschaltet!`);
      this.hooks.onSelectSkin?.(skin);
    } else {
      sfx.deny();
      this.toast(`Noch ${fmt(skin.cost - d.coins)} Münzen fehlen.`);
    }
    this.refreshSkins();
    this.refreshTitle();
  }

  renderDetail() {
    const skin = skinById(this.previewSkin);
    const d = store.get();
    const owned = d.owned.includes(skin.id);
    const active = d.skin === skin.id;
    const cta = active ? 'Angelegt' : owned ? 'Nochmal tippen zum Anlegen' : `Nochmal tippen: ${fmt(skin.cost)} Münzen`;
    $('#skin-detail').innerHTML = `
      <div class="sd-head"><h3>${skin.name}</h3><span class="sd-tag">${skin.tag}</span></div>
      <div class="sd-desc">${skin.desc}</div>
      <div class="sd-perk">${skin.perkText}</div>
      <div class="tiny">${cta}</div>`;
  }

  refreshMissions() {
    const d = store.get();
    $('#mis-coins').textContent = fmt(d.coins);
    for (const r of this.missionRows) {
      r.row.classList.toggle('done', !!d.missions[r.m.id]);
    }
    $('#stat-block').innerHTML = `
      <div><b>${fmt(d.runs)}</b><span>Läufe</span></div>
      <div><b>${fmt(d.totals.meters)}</b><span>Meter gesamt</span></div>
      <div><b>${fmt(d.totals.coins)}</b><span>Münzen gesamt</span></div>
      <div><b>${fmt(d.totals.drones)}</b><span>Drohnen</span></div>
      <div><b>${fmt(d.totals.platforms)}</b><span>Landungen</span></div>
      <div><b>${fmt(d.totals.canisters)}</b><span>Kanister</span></div>`;
  }

  refreshSettings() {
    const s = store.get().settings;
    for (const t of $$('[data-toggle]')) t.classList.toggle('on', !!s[t.dataset.toggle]);
    for (const b of $$('[data-control]')) b.classList.toggle('on', s.control === b.dataset.control);
  }

  // ------------------------------------------------------------------ HUD
  hud(h) {
    $('#hud-m').textContent = fmt(h.meters);
    $('#hud-coins').textContent = fmt(h.coins);
    $('#hud-sector').textContent = h.sectorName;
    const fill = $('#o2-fill');
    fill.style.transform = `scaleX(${clamp(h.o2, 0, 1)})`;
    $('#hud').classList.toggle('low', h.o2 < 0.28);

    const chips = [];
    if (h.shield) chips.push({ k: 'shield', label: 'Schild', color: '#9fe8ff', v: 1 });
    if (h.jet > 0) chips.push({ k: 'jet', label: 'Rucksack', color: '#ffb03a', v: h.jet });
    if (h.magnet > 0) chips.push({ k: 'magnet', label: 'Magnet', color: '#c99dff', v: h.magnet });
    const key = chips.map((c) => c.k).join(',');
    const box = $('#buffs');
    if (key !== this.lastBuffs) {
      this.lastBuffs = key;
      box.innerHTML = chips.map((c) => `
        <div class="buff" data-k="${c.k}" style="color:${c.color}">
          <span class="dot" style="background:${c.color};box-shadow:0 0 8px ${c.color}"></span>
          <span>${c.label}</span>
          <span class="meter"><i style="width:${c.v * 100}%"></i></span>
        </div>`).join('');
    } else {
      for (const c of chips) {
        const el = box.querySelector(`[data-k="${c.k}"] .meter i`);
        if (el) el.style.width = `${c.v * 100}%`;
      }
    }

    const combo = $('#combo');
    if (h.combo >= 5) {
      combo.textContent = `${h.combo}× Kette`;
      combo.classList.add('on');
    } else {
      combo.classList.remove('on');
    }
  }

  banner(index, def) {
    $('#sb-num').textContent = index;
    $('#sb-name').textContent = def.name;
    $('#sb-sub').textContent = def.sub;
    const el = $('#sector-banner');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  pauseStats(h) {
    $('#p-m').textContent = fmt(h.meters);
    $('#p-coins').textContent = fmt(h.coins);
    $('#p-sector').textContent = h.sector;
  }

  gameOver(death, run, result) {
    const d = store.get();
    $('#over-tag').textContent = death.title;
    $('#over-text').textContent = death.text;
    $('#o-m').textContent = fmt(run.meters);
    $('#o-coins').textContent = fmt(run.coins);
    $('#o-sector').textContent = run.sector;
    $('#o-best').textContent = fmt(d.best);
    $('#over-record').classList.toggle('on', result.record);
    $('#mission-pops').innerHTML = result.missions.map((m, i) => `
      <div class="mission-pop" style="animation-delay:${0.15 + i * 0.12}s">
        <b>${m.name}</b><span class="rw"><span class="coin-dot"></span>+${m.reward}</span>
      </div>`).join('');
    if (result.record) sfx.record();
    this.show('over');
  }

  toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // --------------------------------------------------- Vorschau-Animation
  tick(now) {
    requestAnimationFrame((t) => this.tick(t));
    const t = now / 1000;
    const dt = Math.min(0.05, t - (this._last || t));
    this._last = t;
    this.animT += dt;

    if (this.current === 'skins') {
      for (const p of this.portraits) {
        const sel = p.skin.id === this.previewSkin;
        skinPortrait(p.canvas, p.skin, this.animT * (sel ? 1.6 : 1) + p.skin.id.length);
      }
    }
    if (this.current === 'help') {
      for (const l of this.legend) {
        const p = l.plat;
        updatePlatform(p, dt, 96);
        if (l.type === 'boost' && p.fireT <= 0 && Math.sin(this.animT * 1.2) > 0.98) p.fireT = 0.5;
        if (l.type === 'magnet') p.charge = Math.max(0, Math.sin(this.animT * 1.5));
        if (l.type === 'ice') p.hits = Math.sin(this.animT * 0.8) > 0 ? 1 : 0;
        const cv = l.canvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth || 96, h = cv.clientHeight || 34;
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr * (w / 96), 0, 0, dpr * (h / 34), 0, 0);
        ctx.clearRect(0, 0, 96, 34);
        drawPlatform(ctx, p, { camY: 0 });
      }
    }
  }
}
