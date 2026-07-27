# Aetherforge

Ein Fusions-Spiel fürs Handy: Basisrunen kaufen, je zwei Fähigkeiten zu einer
neuen verschmelzen und das Ergebnis in einer Auto-Kampf-Arena gegen immer
härtere Wellen schicken. Die Wellen laufen weiter, auch wenn man gerade
woanders ist oder das Spiel geschlossen hat.

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

## Die Wirtschaft

Die Kurve ist mit einem Simulator geeicht, der einen vernünftigen Spieler
nachspielt (`BAL` in `js/data.js` sind die Regler). Gemessene Marken:

| Welle | erreicht nach | | Element | freigeschaltet nach |
|---|---|---|---|---|
| 5 | 1 min | | Blitz | 1 min |
| 10 | 7 min | | Erde | 6 min |
| 20 | 36 min | | Wind | 18 min |
| 30 | 1,4 h | | Licht | 36 min |
| 40 | 4 h | | Schatten | 1,3 h |
| 75 | 19 h | | Arkan | 3,8 h |

Drei Bremsen halten das im Gleichgewicht:

* **Jede weitere Rune desselben Elements kostet mehr** (die 1. Feuerrune 6 ✦,
  die 41. schon 755 ✦). Reine Kaufkraft bringt einen also nicht durch die
  Wellen — man muss die Mischung verbessern, nicht die Menge.
* **Neue Elemente sind an Wellen gebunden**, nicht nur an Essenz. Man kann
  sich nicht an der Schwierigkeitskurve vorbeikaufen.
* **Nachschmieden und Verwerten hängen am selben Runenkonto.** Der Kodexpreis
  ist der Preis der enthaltenen Runen plus 15 % Aufschlag, das Verwerten gibt
  55 % zurück und schreibt die Runen dem Konto wieder gut. Ohne das wäre eine
  tiefe Fähigkeit im Kodex ein Vielfaches billiger als dieselben Runen
  einzeln — und ohne Fusionsdeckel ließe sich daraus eine Essenzquelle bauen.

Bosse alle fünf Wellen sind die Wände: dort hängt man ein paar Minuten,
rüstet auf und bricht durch. Genau dafür ist auch der Händler da.

## Was sonst noch mitspielt

* **Siegel, die mitwachsen.** Das Bild einer Fähigkeit setzt sich aus drei
  Ebenen zusammen: das Element gibt das Motiv (Flamme, Tropfen, Blitz,
  Kristall, Schwinge, Sonne, Sichel, Runenkreis), die ID gibt das Linienwerk,
  die Stufe gibt Rahmen, Strahlenkranz, Elementsteine und Krone. Eine
  Feuerfähigkeit bleibt über alle Fusionen hinweg als Feuer erkennbar und
  wird trotzdem mit jeder Stufe sichtbar prächtiger.
* **Auto-Verschmelzen.** Optional: gleiche Fähigkeiten im Vorrat legen sich
  von selbst zusammen. Ausgerüstete bleiben unangetastet — wer zwei gleiche
  nebeneinander laufen lassen will, rüstet sie einfach aus.
* **Wellen im Hintergrund.** `idle.js` rechnet dieselbe Wellenmathematik im
  Zeitraffer nach, wenn die Arena nicht sichtbar ist. Beim Zurückkommen zeigt
  eine Übersicht, was passiert ist (gedeckelt auf 8 Stunden).
* **Der Händler** kommt alle fünf Minuten, bleibt zweieinhalb, und hat drei
  **Fremdrunen** in kleiner Stückzahl dabei — die einzige Quelle dafür:
  *Eis* (friert Gegner komplett ein), *Gift* (stapelnde Seuche), *Zeit*
  (setzt Abklingzeiten zurück), *Leere* (bricht Panzer, +110 % gegen Bosse),
  *Kristall* (durchbohrt Reihen, ×4,4 kritisch) und *Stern* (langsam, aber
  reißt Löcher in ganze Wellen). Sie verschmelzen wie alles andere.
* **Elf Seltenheitsstufen** bis *Singularität*, **kein Deckel** auf der
  Fusionstiefe. Gebremst wird ausschließlich über die Kosten — und die
  wachsen schneller als alles, was man dagegen aufbringen kann.
* **Darstellungsqualität** in drei Stufen (Hoch / Mittel / Sparsam). Sie
  ändert Auflösung, Partikelzahl, Sternenlage und die teuren
  CSS-Weichzeichner. Beim ersten Start misst das Spiel einmal die Bildrate
  und senkt die Stufe selbst ab, wenn es nicht rund läuft; eine eigene Wahl
  wird danach nie überstimmt.
* **Gegner-Eigenschaften** ab Welle 6: gepanzert, flink, teilend, zäh — jede
  mit eigenem Aussehen.
* **Transzendenz** ab Welle 25: Lauf zurücksetzen, dafür Sterne für dauerhaft
  mehr Schaden und Essenz. Kodex und freigeschaltete Elemente bleiben.
* **Meilensteine** mit Essenzbelohnung, **Bossleiste**, **Wellenfortschritt**,
  eine eigene Himmelsfarbe je Fünferstaffel und **Ton** aus reiner
  Synthese (keine Audiodateien, abschaltbar).

## Aufbau

```
game/
  index.html            Gerüst aller vier Bildschirme
  css/style.css         Oberfläche (Safe-Area, Daumenbedienung, dunkles Thema)
  js/data.js            Elemente, Rezepte, Namensbausteine, Gegner, Wellenmathematik
  js/fusion.js          Signatur → fertige Fähigkeit (Name, Werte, Farben)
  js/glyph.js           prozedurale Siegel, als Data-URL zwischengespeichert
  js/combat.js          Arena: Wellen, Geschosse, Effekte, Zeichnen
  js/idle.js            dieselben Wellen im Zeitraffer, für Hintergrund/Offline
  js/audio.js           kleiner Synthesizer für alle Klänge
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
