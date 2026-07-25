# Nova Leap

Ein Doodle-Jump-Klon im Weltraum. Man springt automatisch von Plattform zu
Plattform immer weiter nach oben, es geht nie wieder runter, und irgendwann
fällt man doch.

Der eigene Dreh: **Sauerstoff ist die Uhr.** Die O₂-Leiste läuft ununterbrochen
leer und wird nur durch Landungen, Schubdüsen und Kanister wieder aufgefüllt.
Wer zögert, auf einer breiten Plattform herumtrödelt oder lange fällt, verliert
Luft. Damit ist Stillstand kein sicherer Hafen mehr, sondern die zweite
Todesart neben dem Absturz.

Läuft komplett im Browser — kein Server, keine Konten, kein App Store. Der
Spielstand liegt lokal im Gerät (`localStorage`).

Zu erreichen unter `https://gohst136.github.io/spacejump/`.

## Auf dem iPhone installieren

1. In **Safari** (nicht Chrome — nur Safari darf auf iOS Web-Apps installieren)
   `https://gohst136.github.io/spacejump/` öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **Zum Home-Bildschirm** wählen → **Hinzufügen**.

Danach liegt Nova Leap als eigenes Symbol auf dem Home-Bildschirm, startet im
Vollbild ohne Safari-Leisten und funktioniert auch offline.

## Steuerung

| | |
|---|---|
| **Ziehen** | Finger aufs Bild legen und bewegen — die Figur folgt. Standard auf Touchgeräten. |
| **Neigen** | Gerät kippen. Auf iOS muss der Sensor in den Einstellungen einmal freigegeben werden. |
| **Tasten** | ← → oder A/D. Standard am Rechner. |
| **Schießen** | Antippen (kurzer Tipp ohne Ziehen) oder Leertaste. Der Schuss fliegt zum Tippunkt. |
| **Pause** | Esc oder P, oder die Taste oben rechts. |

Die Figur läuft an einer Bildschirmkante raus und an der anderen wieder rein.
Das ist oft der kürzere Weg.

## Sektoren

Alle 600 Meter wechselt der Sektor: eigene Himmelsfarben, eigene Nebel, eigene
Planeten, eine andere Plattformmischung und andere Gefahren. Der Sauerstoff
läuft mit jedem Sektor schneller leer.

| # | Sektor | was dort neu ist |
|---|---|---|
| 1 | Erdorbit | ruhiger Einstieg, erste Drohnen |
| 2 | Asteroidengürtel | treibende Brocken, mehr Plasma |
| 3 | Kyra-Nebel | Phasenplattformen, erste Schwerkraftfelder |
| 4 | Eisgürtel Thal | überall Eisplatten, die nach einer Landung brechen |
| 5 | Wurmlochfeld | Portale, Orbitplattformen, viele Schwerkraftfelder |
| 6 | Tiefe Leere | alles gleichzeitig, dünn gesät |

Danach fängt der Kreis von vorne an — aber schneller, mit weiteren Lücken und
schmaleren Plattformen.

## Die neun Plattformen

* **Stahlplattform** — hält einfach.
* **Driftplattform** — fliegt seitlich weiter und prallt an den Rändern ab.
* **Eisplatte** — zerbricht beim Aufsetzen. Der Sprung geht noch, die Platte
  nicht mehr.
* **Schubdüse** — schleudert dich gut die vierfache Sprunghöhe nach oben und
  gibt zusätzlich Sauerstoff.
* **Phasenplattform** — blinkt im Takt ein und aus. Sie trägt nur, solange sie
  sichtbar ist.
* **Magnetschleuder** — hält dich kurz fest, lädt auf und katapultiert dich
  dann deutlich höher als ein normaler Sprung.
* **Plasmaplattform** — kein Halt, sondern eine Falle. Sie steht immer *neben*
  einer sicheren Plattform, nie an deren Stelle — sonst gäbe es Lücken, die
  niemand springen kann.
* **Portalplattform** — der Sprung setzt dich an einer anderen Stelle derselben
  Höhe wieder ab.
* **Orbitplattform** — kreist um einen Ankerpunkt. Timing statt Zielen.

## Was sonst unterwegs ist

* **Drohne** — von oben draufspringen (gibt einen Extrasprung) oder abschießen.
  Seitlich berühren ist tödlich.
* **Brocken** — treiben quer durchs Bild. Große brauchen zwei Treffer.
* **Mine** — zündet, sobald man in ihren Radius kommt, und der Knall reicht
  weiter als das Gehäuse.
* **Schwerkraftfeld** — zieht über eine große Distanz an dir. Der schwarze Kern
  in der Mitte lässt niemanden wieder los.
* **Rucksackdüse** (2,4 s Steigflug, walzt dabei alles nieder), **Schildblase**
  (fängt einen Treffer ab), **Münzmagnet**, **O₂-Kanister** und **Sternmünzen**.

## Anzüge

Acht Figuren, alle prozedural gezeichnet — im ganzen Ordner liegt kein einziges
Charakterbild. Bezahlt wird mit gesammelten Münzen; jeder Anzug bringt außer
dem Aussehen eine kleine Eigenheit mit.

| Anzug | Preis | Eigenheit |
|---|---|---|
| Pionier | frei | keine — dafür auch keine Schwäche |
| Rostbolzen | 250 | Sauerstoff hält 18 % länger |
| Zyx-9 | 600 | Sprungkraft +7 %, dafür weniger Bodenhaftung in der Luft |
| Major Pfote | 900 | Eisplatten halten einen Sprung länger |
| Neon | 1 400 | Schussrate +45 % |
| Nebelgeist | 2 000 | Phasenplattformen sind immer fest |
| Sternenherz | 2 800 | Münzen werden aus dreifacher Distanz angezogen |
| Void-Kern | 4 000 | Schwerkraftfelder stoßen dich ab, statt dich zu ziehen |

Ein Tipp auf eine Karte wählt sie aus, der zweite kauft bzw. legt sie an.

## Wie das Springen ausbalanciert ist

Ein Sprung trägt genau 163 px hoch, ein voller Auf-und-ab-Zyklus dauert 0,93 s.
Daraus folgt alles andere:

* **Lücken** liegen zwischen 58 und 128 px — klar unter der Sprunghöhe. Als sie
  testweise bis 148 px reichten, blieb man bei jedem zweiten Anlauf hängen.
* **Seitlich** darf die nächste Plattform höchstens 215 px entfernt stehen; bei
  weiten Lücken nur 130 px. Weiter schafft man es in einem Sprung nicht.
* **Sauerstoff**: 3,6 %/s Verbrauch, +2,6 % pro Landung, +9 % pro Schubdüse,
  +34 % pro Kanister. Ein sauberer Steigflug hält die Leiste ungefähr, jeder
  Stolperer kostet — und ab Sektor 3 reicht Springen allein nicht mehr, dann
  muss man Kanister mitnehmen.
* Die ersten fünf Reihen sind eine ruhige Leiter, unter der Startposition liegt
  ein durchgehender Boden, und Gefahren blenden sich über die ersten 500 m ein.

Geeicht wurde das mit einem Bot, der im Browser einen vernünftigen Spieler
nachspielt: rund 700–950 m im Schnitt, beste Läufe über 2 000 m in Sektor 4,
Tode etwa hälftig durch Absturz und durch Berührung.

## Missionen

Zwölf einmalige Ziele (Höhe, Sektoren, Drohnen, Münzen, Schubdüsen, Kanister),
die Münzen auszahlen. Sie werden nach jedem Lauf geprüft und tauchen direkt im
Ergebnisbildschirm auf.

## Aufbau

```
spacejump/
  index.html            Gerüst aller Bildschirme
  css/style.css         Oberfläche (Safe-Area, Daumenbedienung, dunkles Thema)
  js/util.js            Mathe, Zufall, Farben, Pfad-Hilfen
  js/sectors.js         Sektordefinitionen: Farben, Mischungen, Gefahren
  js/background.js      Himmel, Nebel, drei Sternenschichten, Planeten, Staub
  js/skins.js           die acht Figuren, jede als eigene Zeichenfunktion
  js/platforms.js       die neun Plattformarten: Verhalten und Aussehen
  js/entities.js        Aufsammelbares, Gegner, Geschosse, Partikelsystem
  js/player.js          Physik und Zustände der Figur
  js/game.js            Welt erzeugen, Kollisionen, Sauerstoff, Zeichnen
  js/ui.js              Bildschirme, HUD, Anzugauswahl, Missionen
  js/audio.js           kleiner Synthesizer für Klänge und Hintergrundklang
  js/main.js            Eingabe, Schleife, Verdrahtung
  sw.js                 Offline-Cache (VERSION bei Änderungen hochzählen)
  manifest.webmanifest  Web-App-Manifest
  icons/                App-Symbole
```

Es gibt keine einzige Bild- oder Audiodatei außer den App-Symbolen: Figuren,
Plattformen, Planeten, Gegner und alle Klänge entstehen zur Laufzeit.

Lokal testen: `python3 -m http.server` im Projektordner starten und
`http://localhost:8000/spacejump/` aufrufen. Wichtig ist ein echter Server —
über `file://` blockiert der Browser die ES-Module.

Nach Änderungen an Dateien, die im Offline-Cache stehen, die Konstante
`VERSION` in `sw.js` hochzählen, sonst bekommen installierte Geräte weiter die
alte Fassung.

Zum Nachmessen liegt das Spiel unter `window.novaLeap` in der Konsole
(`game`, `ui`, `store`, `Game`).
