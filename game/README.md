# Aetherforge

Ein Fusions-Spiel fürs Handy: Basisrunen kaufen, je zwei Fähigkeiten zu einer
neuen verschmelzen und das Ergebnis in einer Auto-Kampf-Arena gegen immer
härtere Wellen schicken.

Läuft komplett im Browser — kein Server, keine Konten, kein App Store.
Der Spielstand liegt lokal im Gerät (`localStorage`).

## Auf dem iPhone installieren

1. In **Safari** (nicht Chrome — nur Safari darf auf iOS Web-Apps installieren)
   `https://gohst136.github.io/game/` öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **Zum Home-Bildschirm** wählen → **Hinzufügen**.

Danach liegt Aetherforge als eigenes Symbol auf dem Home-Bildschirm, startet im
Vollbild ohne Safari-Leisten und funktioniert auch offline.

## Wie das Spiel funktioniert

**Fähigkeiten sind nichts als Mengen von Runen.** `Feuer ×2 + Blitz ×1` ergibt
immer und überall dieselbe Fähigkeit — Name, Farben, Siegel und Werte werden
aus dieser Signatur berechnet, nicht gewürfelt. Deshalb ist eine Entdeckung
dauerhaft: dieselbe Verschmelzung liefert morgen dasselbe Ergebnis, und der
Kodex ist eine echte Sammlung statt einer Liste von Zufällen.

* **Stufe** ergibt sich aus der Anzahl verschmolzener Runen (1 → Gewöhnlich,
  25+ → Göttlich).
* **Vielfalt zahlt sich aus**: verschiedene Elemente geben Bonus, achtmal Feuer
  ist schwächer als vier verschiedene Elemente in derselben Menge.
* **Jedes Element bringt eine Mechanik mit** — Feuer brennt, Wasser
  verlangsamt, Blitz springt weiter, Wind durchdringt, Licht kritzt härter,
  Schatten zehrt Leben ab, Arkan wiederholt den Angriff, Erde schlägt in die
  Fläche. Die Anteile in der Mischung bestimmen, wie stark der jeweilige
  Effekt ausfällt.
* **Verschmelzen verbraucht beide Zutaten** — aber alles, was einmal im Kodex
  steht, lässt sich dort jederzeit gegen Essenz nachschmieden. Man verliert
  also nie eine Entdeckung, nur Material.

## Aufbau

```
game/
  index.html            Gerüst aller vier Bildschirme
  css/style.css         Oberfläche (Safe-Area, Daumenbedienung, dunkles Thema)
  js/data.js            Elemente, Rezepte, Namensbausteine, Gegner, Wellenmathematik
  js/fusion.js          Signatur → fertige Fähigkeit (Name, Werte, Farben)
  js/glyph.js           prozedurale Siegel, als Data-URL zwischengespeichert
  js/combat.js          Arena: Wellen, Geschosse, Effekte, Zeichnen
  js/state.js           Spielstand und alle Aktionen darauf
  js/ui.js              Bildschirme, Detailblatt, Enthüllungs-Animation
  js/main.js            Verdrahtung
  sw.js                 Offline-Cache (VERSION bei Änderungen hochzählen)
  manifest.webmanifest  Web-App-Manifest
  icons/                App-Symbole
```

Lokal testen: `python3 -m http.server` im Projektordner starten und
`http://localhost:8000/game/` aufrufen. Wichtig ist ein echter Server —
über `file://` blockiert der Browser die ES-Module.

Nach Änderungen an Dateien, die im Offline-Cache stehen, die Konstante
`VERSION` in `sw.js` hochzählen, sonst bekommen installierte Geräte weiter die
alte Fassung.
