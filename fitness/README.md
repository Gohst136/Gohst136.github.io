# Formkurve

Ein Kalorien-Tracker fürs iPhone, der sich nicht wie Buchhaltung anfühlt.
Tagesziel aus dem eigenen Grundumsatz, Tagebuch für vier Mahlzeiten, Training,
Wasser, Gewichtsverlauf — und als Kern: **Teller abfotografieren statt suchen.**

Der eigene Dreh: Die Kamera schickt das Foto an Claude, das Gericht wird in seine
Komponenten zerlegt, die Portion anhand von Teller, Besteck und Verpackungen
geschätzt und daraus Kalorien plus Makros berechnet. Man bekommt keine fertige
Zahl vorgesetzt, sondern eine **Liste zum Korrigieren**: jede Zutat mit ihrer
Menge, alles einzeln nachjustierbar, bevor es im Tagebuch landet.

Läuft komplett im Browser — kein Server, keine Konten, kein App Store. Alle Daten
liegen lokal im Gerät (`localStorage`).

Zu erreichen unter `https://gohst136.github.io/fitness/`.

## Auf dem iPhone installieren

1. In **Safari** (nicht Chrome — nur Safari darf auf iOS Web-Apps installieren)
   `https://gohst136.github.io/fitness/` öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **Zum Home-Bildschirm** wählen → **Hinzufügen**.

Danach liegt Formkurve als eigenes Symbol auf dem Home-Bildschirm, startet im
Vollbild ohne Safari-Leisten und funktioniert offline. Nur die Foto-Erkennung
braucht Internet.

## Die Foto-Erkennung einrichten

Die App hat keinen eigenen Server, also auch keinen zentralen KI-Zugang. Wer die
Kamera-Schätzung nutzen will, hinterlegt einmalig einen eigenen API-Schlüssel
von Anthropic — das Foto geht dann direkt vom iPhone an `api.anthropic.com`.

1. Auf [console.anthropic.com](https://console.anthropic.com) einen Account anlegen.
2. Unter **API Keys** einen Schlüssel erzeugen.
3. In der App: **Profil → Foto-Erkennung**, Schlüssel einfügen, **Verbindung testen**.

| | |
|---|---|
| **Modell** | Claude Opus 5 (Standard), wahlweise Sonnet 5 oder Haiku 4.5 |
| **Kosten** | Ein paar Cent pro Analyse, abgerechnet über das eigene Anthropic-Konto |
| **Bilder** | Werden auf 1024 px verkleinert, verlassen das Gerät nur für die Anfrage und werden nirgends gespeichert |
| **Schlüssel** | Liegt nur im `localStorage` dieses Browsers |

**Wichtig:** Wer Zugriff auf das entsperrte Gerät hat, kommt an den Schlüssel.
Also einen eigenen Key nehmen, den man im Zweifel schnell in der Console sperren
kann — und keinen, der noch für andere Dinge im Einsatz ist.

Ohne Schlüssel funktioniert alles andere ganz normal: Suche, Tagebuch, Training,
Ziele, Statistik.

## Was drin ist

| Bereich | |
|---|---|
| **Heute** | Kalorienring mit Restbudget, Makrobalken, Mahlzeiten auf einen Blick, Wasser |
| **Tagebuch** | Frühstück, Mittag, Abend, Snacks — jeder Eintrag antippbar und korrigierbar |
| **Training** | 32 Aktivitäten mit MET-Werten, bei Ausdauersport zusätzlich Kilometer, Verbrauch kommt aufs Tagesbudget drauf, Wochenchart, Gewichtsverlauf |
| **Profil** | Ziel aus Alter, Größe, Gewicht, Aktivität und Vorhaben — oder eigene Zielwerte |
| **Datenbank** | ~140 Lebensmittel mit Nährwerten pro 100 g/ml, plus eigene Einträge und Favoriten |

Nach links oder rechts wischen wechselt den Tag. Das Kamerasymbol in der Mitte
der Leiste startet die Foto-Erkennung.

## Wie gerechnet wird

- **Grundumsatz** nach Mifflin-St Jeor, mal Aktivitätsfaktor (1,2 bis 1,9)
  ergibt den Tagesbedarf.
- **Ziel**: Abnehmen −500 kcal, langsam abnehmen −300, halten ±0, aufbauen +300.
- **Eiweiß** nach Körpergewicht (1,6–2,0 g/kg), **Fett** auf 27 % der Kalorien,
  der Rest sind Kohlenhydrate.
- **Sport**: `kcal = MET × 3,5 × kg / 200 × Minuten`.
- **Strecke**: Bei Wandern, Laufen, Radfahren und Co. lässt sich zusätzlich die
  Strecke eintragen. Wo das Tempo den Verbrauch bestimmt — Gehen, Laufen,
  Radfahren, Skaten — wird der MET-Wert daraus abgeleitet statt pauschal
  angenommen: 10 km in einer Stunde zählen anders als 13 km. Bei Wandern,
  Schwimmen oder Mountainbike entscheidet eher Gelände als Tempo, dort wird die
  Strecke nur mitgeschrieben. Die Wochenübersicht summiert die Kilometer.

Die Schätzungen der Foto-Erkennung sind gut für den Alltag, aber kein Laborwert.
Wenn etwas nicht passt: Menge im Ergebnis anpassen oder unter „Schätzung
anpassen lassen" kurz dazuschreiben, was anders war („nur die Hälfte gegessen",
„mit extra Käse") — dann schätzt Claude mit dieser Info neu.

## Technisch

Reines HTML, CSS und ES-Module, kein Build-Schritt, keine Abhängigkeiten. Der
Service Worker cacht die App für offline; API-Aufrufe laufen bewusst nie über
den Cache.

```
index.html          Grundgerüst, Tabs, Sheet- und Kamera-Container
css/style.css       gesamtes Design
js/main.js          Start, Tabwechsel, Datum
js/views.js         Heute, Tagebuch, Training, Profil
js/state.js         Speicherstand und Auswertung
js/ui.js            Sheets, Toasts, Ring, Balken, Diagramme
js/ai.js            Claude-Aufruf inkl. JSON-Schema für die Antwort
js/camera.js        Live-Sucher mit Rückfall auf die Systemkamera
js/scan.js          Foto-Flow: aufnehmen → schätzen → prüfen → eintragen
js/food-picker.js   Suche, Portionsauswahl, eigene Lebensmittel
js/foods.js         Lebensmittel-Datenbank
js/nutrition.js     Grundumsatz, Ziele, MET-Werte
js/settings.js      Profil, KI-Zugang, Datenverwaltung
```

Unter **Profil → Daten** lässt sich alles als JSON exportieren und wieder
einlesen. Vor einem Gerätewechsel lohnt sich das: Safari räumt den lokalen
Speicher irgendwann von selbst auf.
