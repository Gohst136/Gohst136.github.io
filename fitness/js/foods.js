// Lebensmittel-Datenbank. Alle Werte pro 100 g bzw. 100 ml.
// Format: [Name, kcal, Eiweiß, Kohlenhydrate, Fett, Einheit, übliche Portion, Kategorie]

import { norm } from './util.js';

const RAW = [
  // — Getreide, Beilagen —
  ['Haferflocken', 372, 13.5, 58.7, 7, 'g', 50, 'Getreide'],
  ['Müsli', 360, 10, 60, 8, 'g', 60, 'Getreide'],
  ['Cornflakes', 378, 7, 84, 0.9, 'g', 40, 'Getreide'],
  ['Vollkornbrot', 210, 7, 38, 2.5, 'g', 50, 'Getreide'],
  ['Weißbrot / Brötchen', 265, 8, 50, 3, 'g', 60, 'Getreide'],
  ['Toastbrot', 270, 8, 48, 4, 'g', 30, 'Getreide'],
  ['Knäckebrot', 330, 10, 65, 1.5, 'g', 20, 'Getreide'],
  ['Reis, gekocht', 130, 2.7, 28, 0.3, 'g', 180, 'Getreide'],
  ['Reis, roh', 350, 7, 78, 1, 'g', 75, 'Getreide'],
  ['Nudeln, gekocht', 158, 5.8, 31, 0.9, 'g', 200, 'Getreide'],
  ['Nudeln, roh', 360, 12.5, 71, 1.5, 'g', 100, 'Getreide'],
  ['Vollkornnudeln, gekocht', 149, 6, 27, 1.4, 'g', 200, 'Getreide'],
  ['Kartoffeln, gekocht', 77, 2, 17, 0.1, 'g', 200, 'Getreide'],
  ['Kartoffelpüree', 83, 2, 13, 2.5, 'g', 200, 'Getreide'],
  ['Pommes frites', 312, 3.4, 41, 15, 'g', 150, 'Getreide'],
  ['Couscous, gekocht', 112, 3.8, 23, 0.2, 'g', 180, 'Getreide'],
  ['Quinoa, gekocht', 120, 4.4, 21, 1.9, 'g', 180, 'Getreide'],
  ['Bulgur, gekocht', 83, 3, 19, 0.2, 'g', 180, 'Getreide'],

  // — Milchprodukte —
  ['Milch 3,5 %', 64, 3.4, 4.8, 3.5, 'ml', 200, 'Milchprodukte'],
  ['Milch 1,5 %', 47, 3.4, 4.9, 1.5, 'ml', 200, 'Milchprodukte'],
  ['Haferdrink', 45, 0.4, 6.6, 1.5, 'ml', 200, 'Milchprodukte'],
  ['Sojadrink', 39, 3.3, 0.6, 1.9, 'ml', 200, 'Milchprodukte'],
  ['Magerquark', 67, 12, 4, 0.3, 'g', 250, 'Milchprodukte'],
  ['Speisequark 20 %', 109, 12, 3.5, 5, 'g', 250, 'Milchprodukte'],
  ['Naturjoghurt 3,5 %', 63, 3.5, 4.7, 3.5, 'g', 150, 'Milchprodukte'],
  ['Griechischer Joghurt 10 %', 133, 4, 4, 10, 'g', 150, 'Milchprodukte'],
  ['Skyr', 63, 11, 4, 0.2, 'g', 150, 'Milchprodukte'],
  ['Fruchtjoghurt', 95, 3, 15, 2.5, 'g', 150, 'Milchprodukte'],
  ['Hüttenkäse', 98, 12, 3, 4.3, 'g', 200, 'Milchprodukte'],
  ['Gouda', 356, 25, 0, 28, 'g', 30, 'Milchprodukte'],
  ['Mozzarella', 254, 18, 1, 19, 'g', 60, 'Milchprodukte'],
  ['Frischkäse', 250, 6, 3, 24, 'g', 30, 'Milchprodukte'],
  ['Parmesan', 398, 36, 0, 27, 'g', 15, 'Milchprodukte'],
  ['Butter', 741, 0.7, 0.6, 83, 'g', 10, 'Milchprodukte'],
  ['Sahne 30 %', 292, 2.4, 3.2, 30, 'g', 20, 'Milchprodukte'],

  // — Fleisch, Fisch, Eier —
  ['Hähnchenbrust, roh', 106, 23, 0, 1.8, 'g', 150, 'Protein'],
  ['Hähnchenbrust, gebraten', 165, 31, 0, 3.6, 'g', 150, 'Protein'],
  ['Putenbrust', 111, 24, 0, 1, 'g', 150, 'Protein'],
  ['Rinderhack 20 %', 250, 18, 0, 20, 'g', 150, 'Protein'],
  ['Rinderhack mager 5 %', 137, 21, 0, 5, 'g', 150, 'Protein'],
  ['Rindersteak', 190, 27, 0, 9, 'g', 200, 'Protein'],
  ['Schweineschnitzel, natur', 108, 22, 0, 2, 'g', 150, 'Protein'],
  ['Schnitzel, paniert', 290, 20, 12, 18, 'g', 180, 'Protein'],
  ['Bratwurst', 300, 12, 1, 27, 'g', 100, 'Protein'],
  ['Salami', 380, 18, 1, 34, 'g', 30, 'Protein'],
  ['Kochschinken', 110, 20, 1, 3, 'g', 30, 'Protein'],
  ['Speck', 540, 12, 0, 54, 'g', 25, 'Protein'],
  ['Lachs', 208, 20, 0, 13, 'g', 150, 'Protein'],
  ['Forelle', 119, 20, 0, 4, 'g', 150, 'Protein'],
  ['Thunfisch (Dose, Wasser)', 108, 24, 0, 1, 'g', 100, 'Protein'],
  ['Garnelen', 99, 24, 0, 0.3, 'g', 120, 'Protein'],
  ['Ei', 143, 13, 1, 10, 'g', 58, 'Protein'],
  ['Tofu, natur', 144, 15, 2, 9, 'g', 150, 'Protein'],
  ['Tempeh', 192, 19, 8, 11, 'g', 100, 'Protein'],
  ['Seitan', 141, 25, 4, 2, 'g', 100, 'Protein'],
  ['Linsen, gekocht', 116, 9, 20, 0.4, 'g', 150, 'Protein'],
  ['Kichererbsen, gekocht', 164, 9, 27, 2.6, 'g', 150, 'Protein'],
  ['Kidneybohnen, gekocht', 127, 9, 22, 0.5, 'g', 150, 'Protein'],

  // — Gemüse —
  ['Brokkoli', 34, 2.8, 7, 0.4, 'g', 200, 'Gemüse'],
  ['Blumenkohl', 25, 1.9, 5, 0.3, 'g', 200, 'Gemüse'],
  ['Tomate', 18, 0.9, 3.9, 0.2, 'g', 150, 'Gemüse'],
  ['Gurke', 15, 0.7, 3.6, 0.1, 'g', 150, 'Gemüse'],
  ['Paprika', 31, 1, 6, 0.3, 'g', 150, 'Gemüse'],
  ['Karotte', 41, 0.9, 10, 0.2, 'g', 100, 'Gemüse'],
  ['Zwiebel', 40, 1.1, 9, 0.1, 'g', 50, 'Gemüse'],
  ['Spinat', 23, 2.9, 3.6, 0.4, 'g', 150, 'Gemüse'],
  ['Zucchini', 17, 1.2, 3, 0.3, 'g', 200, 'Gemüse'],
  ['Champignons', 22, 3, 3, 0.3, 'g', 150, 'Gemüse'],
  ['Erbsen', 81, 5, 14, 0.4, 'g', 150, 'Gemüse'],
  ['Mais (Dose)', 86, 3.2, 19, 1.2, 'g', 100, 'Gemüse'],
  ['Blattsalat', 15, 1.4, 2.9, 0.2, 'g', 100, 'Gemüse'],
  ['Avocado', 160, 2, 9, 15, 'g', 100, 'Gemüse'],

  // — Obst —
  ['Apfel', 52, 0.3, 14, 0.2, 'g', 150, 'Obst'],
  ['Banane', 89, 1.1, 23, 0.3, 'g', 120, 'Obst'],
  ['Orange', 47, 0.9, 12, 0.1, 'g', 180, 'Obst'],
  ['Birne', 57, 0.4, 15, 0.1, 'g', 150, 'Obst'],
  ['Erdbeeren', 32, 0.7, 7.7, 0.3, 'g', 150, 'Obst'],
  ['Heidelbeeren', 57, 0.7, 14, 0.3, 'g', 100, 'Obst'],
  ['Weintrauben', 69, 0.7, 18, 0.2, 'g', 100, 'Obst'],
  ['Kiwi', 61, 1.1, 15, 0.5, 'g', 80, 'Obst'],
  ['Mango', 60, 0.8, 15, 0.4, 'g', 150, 'Obst'],
  ['Ananas', 50, 0.5, 13, 0.1, 'g', 150, 'Obst'],
  ['Wassermelone', 30, 0.6, 8, 0.2, 'g', 200, 'Obst'],

  // — Nüsse & Fette —
  ['Mandeln', 579, 21, 22, 50, 'g', 30, 'Nüsse & Fette'],
  ['Walnüsse', 654, 15, 14, 65, 'g', 30, 'Nüsse & Fette'],
  ['Cashewkerne', 553, 18, 30, 44, 'g', 30, 'Nüsse & Fette'],
  ['Erdnussbutter', 588, 25, 20, 50, 'g', 20, 'Nüsse & Fette'],
  ['Leinsamen', 534, 18, 29, 42, 'g', 15, 'Nüsse & Fette'],
  ['Chiasamen', 486, 17, 42, 31, 'g', 15, 'Nüsse & Fette'],
  ['Olivenöl', 884, 0, 0, 100, 'g', 10, 'Nüsse & Fette'],
  ['Rapsöl', 884, 0, 0, 100, 'g', 10, 'Nüsse & Fette'],

  // — Gerichte —
  ['Pizza Margherita', 266, 11, 33, 10, 'g', 300, 'Gerichte'],
  ['Döner Kebab', 215, 15, 15, 11, 'g', 350, 'Gerichte'],
  ['Burger', 257, 13, 20, 14, 'g', 220, 'Gerichte'],
  ['Currywurst mit Pommes', 230, 8, 20, 14, 'g', 400, 'Gerichte'],
  ['Spaghetti Bolognese', 130, 7, 15, 4.5, 'g', 400, 'Gerichte'],
  ['Lasagne', 132, 8, 12, 6, 'g', 350, 'Gerichte'],
  ['Käsespätzle', 230, 9, 25, 10, 'g', 350, 'Gerichte'],
  ['Gulasch', 150, 15, 5, 8, 'g', 300, 'Gerichte'],
  ['Sushi (Maki)', 145, 5, 30, 1, 'g', 200, 'Gerichte'],
  ['Falafel', 333, 13, 32, 18, 'g', 120, 'Gerichte'],
  ['Chicken Nuggets', 296, 15, 16, 19, 'g', 150, 'Gerichte'],
  ['Salatbowl mit Hähnchen', 120, 12, 6, 5, 'g', 350, 'Gerichte'],
  ['Milchreis', 130, 4, 20, 3, 'g', 250, 'Gerichte'],
  ['Pfannkuchen', 227, 6, 28, 10, 'g', 150, 'Gerichte'],

  // — Snacks & Süßes —
  ['Vollmilchschokolade', 535, 7.5, 57, 30, 'g', 25, 'Snacks'],
  ['Zartbitterschokolade 70 %', 598, 8, 46, 43, 'g', 25, 'Snacks'],
  ['Gummibärchen', 343, 7, 77, 0.1, 'g', 50, 'Snacks'],
  ['Chips', 536, 6, 53, 34, 'g', 50, 'Snacks'],
  ['Salzstangen', 380, 10, 76, 3, 'g', 40, 'Snacks'],
  ['Kekse', 480, 6, 65, 21, 'g', 30, 'Snacks'],
  ['Eiscreme', 207, 3.5, 24, 11, 'g', 100, 'Snacks'],
  ['Croissant', 406, 8, 46, 21, 'g', 60, 'Snacks'],
  ['Donut', 452, 5, 51, 25, 'g', 70, 'Snacks'],
  ['Rührkuchen', 380, 5, 50, 18, 'g', 100, 'Snacks'],
  ['Käsekuchen', 280, 7, 30, 14, 'g', 120, 'Snacks'],
  ['Müsliriegel', 420, 6, 65, 14, 'g', 25, 'Snacks'],
  ['Proteinriegel', 350, 33, 32, 10, 'g', 60, 'Snacks'],
  ['Whey-Protein-Pulver', 380, 78, 6, 5, 'g', 30, 'Snacks'],

  // — Getränke —
  ['Wasser', 0, 0, 0, 0, 'ml', 250, 'Getränke'],
  ['Kaffee, schwarz', 2, 0.2, 0, 0, 'ml', 200, 'Getränke'],
  ['Cappuccino', 45, 2.5, 4, 2, 'ml', 150, 'Getränke'],
  ['Latte Macchiato', 55, 3, 5, 2.5, 'ml', 250, 'Getränke'],
  ['Tee, ungesüßt', 1, 0, 0.2, 0, 'ml', 250, 'Getränke'],
  ['Cola', 42, 0, 10.6, 0, 'ml', 330, 'Getränke'],
  ['Cola Zero', 0.3, 0, 0, 0, 'ml', 330, 'Getränke'],
  ['Apfelsaft', 46, 0.1, 11, 0.1, 'ml', 200, 'Getränke'],
  ['Orangensaft', 45, 0.7, 10, 0.2, 'ml', 200, 'Getränke'],
  ['Eistee', 30, 0, 7.5, 0, 'ml', 330, 'Getränke'],
  ['Energydrink', 45, 0, 11, 0, 'ml', 250, 'Getränke'],
  ['Smoothie', 60, 0.8, 13, 0.3, 'ml', 250, 'Getränke'],
  ['Proteinshake (fertig)', 40, 8, 1, 0.8, 'ml', 250, 'Getränke'],
  ['Bier', 43, 0.5, 3.6, 0, 'ml', 500, 'Getränke'],
  ['Weißwein', 82, 0.1, 2.6, 0, 'ml', 200, 'Getränke'],
  ['Rotwein', 85, 0.1, 2.6, 0, 'ml', 200, 'Getränke'],
];

export const FOODS = RAW.map(([name, kcal, p, c, f, unit, portion, cat], i) => ({
  id: `db${i}`,
  name,
  per100: { kcal, p, c, f },
  unit,
  portion,
  cat,
  key: norm(name),
}));

export const CATEGORIES = [...new Set(FOODS.map((f) => f.cat))];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));
export const foodById = (id) => BY_ID.get(id);

/** Suche über Name und Kategorie, Treffer am Wortanfang zuerst. */
export function searchFoods(query, extra = []) {
  const all = [...extra, ...FOODS];
  const q = norm(query);
  if (!q) return all.slice(0, 40);
  const scored = [];
  for (const f of all) {
    const key = f.key || norm(f.name);
    let score = -1;
    if (key.startsWith(q)) score = 0;
    else if (key.includes(` ${q}`)) score = 1;
    else if (key.includes(q)) score = 2;
    else if (norm(f.cat || '').includes(q)) score = 3;
    if (score >= 0) scored.push([score, f]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'de'));
  return scored.slice(0, 60).map(([, f]) => f);
}
