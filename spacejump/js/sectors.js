// Sektoren: alle SECTOR_M Meter wechseln Farben, Plattformmischung und Gefahren.

export const SECTOR_M = 600;   // Meter pro Sektor
export const PX_PER_M = 10;    // Umrechnung Welt-Pixel → Meter

export const SECTORS = [
  {
    name: 'Erdorbit',
    sub: 'Noch sieht man die Küstenlinien',
    sky: [[228, 62, 16], [246, 58, 6]],
    neb: [[205, 85, 55], [262, 75, 48]],
    star: [200, 40, 92],
    planet: [[210, 70, 52], [150, 55, 45]],
    ring: false,
    o2: 1.0,
    gap: 1.0,
    weights: { normal: 62, moving: 16, ice: 8, boost: 7, phase: 0, magnet: 5, plasma: 2, portal: 0, orbit: 0 },
    danger: { drone: 0.35, asteroid: 0.1, hole: 0 },
  },
  {
    name: 'Asteroidengürtel',
    sub: 'Gestein, so weit die Sensoren reichen',
    sky: [[24, 45, 14], [18, 55, 6]],
    neb: [[32, 80, 50], [8, 70, 42]],
    star: [40, 45, 90],
    planet: [[28, 45, 44], [18, 40, 34]],
    ring: false,
    o2: 1.08,
    gap: 1.05,
    weights: { normal: 46, moving: 20, ice: 12, boost: 7, phase: 3, magnet: 6, plasma: 6, portal: 0, orbit: 0 },
    danger: { drone: 0.5, asteroid: 0.85, hole: 0 },
  },
  {
    name: 'Kyra-Nebel',
    sub: 'Leuchtender Staub, schlechte Sicht',
    sky: [[288, 55, 15], [312, 60, 8]],
    neb: [[300, 90, 58], [190, 85, 52]],
    star: [300, 50, 92],
    planet: [[290, 60, 50], [330, 65, 46]],
    ring: true,
    o2: 1.16,
    gap: 1.08,
    weights: { normal: 34, moving: 18, ice: 8, boost: 8, phase: 18, magnet: 6, plasma: 6, portal: 2, orbit: 0 },
    danger: { drone: 0.65, asteroid: 0.35, hole: 0.2 },
  },
  {
    name: 'Eisgürtel Thal',
    sub: 'Gefrorene Trümmer eines alten Monds',
    sky: [[192, 55, 15], [206, 62, 7]],
    neb: [[186, 90, 58], [222, 80, 50]],
    star: [190, 35, 95],
    planet: [[195, 55, 55], [210, 45, 42]],
    ring: false,
    o2: 1.24,
    gap: 1.12,
    weights: { normal: 28, moving: 20, ice: 26, boost: 8, phase: 6, magnet: 4, plasma: 6, portal: 2, orbit: 0 },
    danger: { drone: 0.6, asteroid: 0.5, hole: 0.15 },
  },
  {
    name: 'Wurmlochfeld',
    sub: 'Der Raum hat hier Löcher',
    sky: [[150, 45, 13], [268, 55, 8]],
    neb: [[140, 85, 50], [280, 85, 52]],
    star: [140, 45, 92],
    planet: [[160, 55, 46], [275, 60, 48]],
    ring: true,
    o2: 1.32,
    gap: 1.16,
    weights: { normal: 24, moving: 16, ice: 10, boost: 8, phase: 12, magnet: 5, plasma: 7, portal: 12, orbit: 6 },
    danger: { drone: 0.7, asteroid: 0.4, hole: 0.75 },
  },
  {
    name: 'Tiefe Leere',
    sub: 'Keine Karte reicht weiter',
    sky: [[248, 40, 9], [255, 45, 4]],
    neb: [[258, 70, 44], [318, 60, 40]],
    star: [250, 25, 96],
    planet: [[250, 40, 38], [285, 45, 40]],
    ring: true,
    o2: 1.42,
    gap: 1.22,
    weights: { normal: 20, moving: 18, ice: 12, boost: 9, phase: 14, magnet: 5, plasma: 9, portal: 8, orbit: 10 },
    danger: { drone: 0.85, asteroid: 0.6, hole: 0.6 },
  },
];

/** Sektor-Index (1-basiert) für eine Höhe in Metern. */
export function sectorIndex(meters) {
  return Math.floor(meters / SECTOR_M) + 1;
}

/** Die Definition zu einem 1-basierten Sektor — nach dem letzten wird zyklisch weitergezählt. */
export function sectorDef(index) {
  const i = Math.max(0, index - 1);
  return SECTORS[i % SECTORS.length];
}

/** Wie oft der Sektorenkreis schon durchlaufen wurde (0 beim ersten Mal). */
export function sectorLoop(index) {
  return Math.floor(Math.max(0, index - 1) / SECTORS.length);
}

/** Anteil innerhalb des aktuellen Sektors, 0..1 — für weiche Farbübergänge. */
export function sectorProgress(meters) {
  const t = (meters % SECTOR_M) / SECTOR_M;
  return t < 0 ? 0 : t;
}
