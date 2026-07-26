// Foto aufnehmen — live über die Kamera, sonst über die Foto-Auswahl des Systems.

import { $, el, tap } from './util.js';
import { prepareImage, prepareFromCanvas } from './ai.js';
import { toast } from './ui.js';

/** Öffnet die Systemauswahl (Kamera oder Galerie) und liefert das Bild. */
export function pickFile({ camera = false } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      try {
        resolve(await prepareImage(file));
      } catch (e) {
        toast('Bild konnte nicht gelesen werden.', 'bad');
        resolve(null);
      }
    });
    // Safari braucht das Element im DOM, damit der Klick zieht.
    document.body.append(input);
    input.click();
  });
}

/**
 * Live-Sucher. Fällt automatisch auf die Systemkamera zurück, wenn der Browser
 * keinen Zugriff auf den Videostream gibt (ältere iOS-Versionen, kein HTTPS …).
 */
export async function captureImage() {
  if (!navigator.mediaDevices?.getUserMedia) return pickFile({ camera: true });

  let stream;
  let facing = 'environment';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 } },
      audio: false,
    });
  } catch (e) {
    if (e?.name === 'NotAllowedError') {
      toast('Kamerazugriff abgelehnt — nutze die Fotoauswahl.', 'warn');
    }
    return pickFile({ camera: true });
  }

  return new Promise((resolve) => {
    const host = $('#cam-host');
    const video = el('video', { class: 'cam-video', playsinline: true, autoplay: true, muted: true });
    video.srcObject = stream;
    video.play().catch(() => {});

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      stream.getTracks().forEach((t) => t.stop());
      overlay.classList.remove('shown');
      setTimeout(() => overlay.remove(), 220);
      resolve(value);
    };

    const shoot = async () => {
      tap(12);
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 960;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      flash.classList.add('fire');
      const img = await prepareFromCanvas(canvas);
      finish(img);
    };

    const swap = async () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      stream.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } }, audio: false,
        });
        video.srcObject = stream;
        video.play().catch(() => {});
      } catch (e) {
        toast('Kamera lässt sich nicht wechseln.', 'warn');
      }
    };

    const flash = el('div', { class: 'cam-flash' });
    const overlay = el('div', { class: 'cam-overlay' },
      video,
      flash,
      el('div', { class: 'cam-frame' },
        el('i'), el('i'), el('i'), el('i'),
        el('p', { class: 'cam-hint', text: 'Teller mittig ins Bild — Besteck oder Hand helfen beim Schätzen' })),
      el('div', { class: 'cam-bar' },
        el('button', {
          class: 'cam-side', 'aria-label': 'Aus Fotos wählen',
          onclick: async () => { const img = await pickFile(); if (img) finish(img); },
        }, '🖼'),
        el('button', { class: 'cam-shutter', 'aria-label': 'Auslösen', onclick: shoot }, el('i')),
        el('button', { class: 'cam-side', 'aria-label': 'Kamera wechseln', onclick: swap }, '🔄')),
      el('button', { class: 'cam-close', 'aria-label': 'Schließen', onclick: () => finish(null) }, '✕'));

    host.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('shown'));
  });
}
