# MacRay Status

Installierbare Web-App (PWA) zur Anzeige des Job-Status vom Mac. Sie kommt ohne Build-Schritt aus und besteht nur aus HTML, CSS und JS.
Alle Daten liegen **verschlüsselt** in `feed/` und werden erst im Browser mit dem Passwort entschlüsselt
(Web Crypto: PBKDF2-SHA256 → AES-256-CBC + HMAC-SHA256).

| Datei | Zweck |
|---|---|
| `index.html`, `style.css`, `app.js` | die App |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (Homescreen, offline-fähige Hülle) |
| `feed/status.enc`, `feed/img/*.bin` | verschlüsselter Feed (vom Mac hochgeladen) |
| `config.js` | Feed-Adresse (`feed/` im Repo oder live vom Mac) |
| `tools/make_test_feed.py` | erzeugt einen Beispiel-Feed (Passwort `test`) |
| `tools/serve_feed.py` | liefert den Feed live vom Mac aus (für Tailscale Funnel) |
| `tools/de.macray.feed.plist` | Autostart-Vorlage für `serve_feed.py` (launchd) |

## Testen

```bash
python3 tools/make_test_feed.py          # schreibt feed/status.enc + ein Bild
python3 -m http.server 8000              # http://localhost:8000 öffnen, Passwort: test
```

Die Funktionen `derive_keys`, `write_status` und `write_image` aus dem Testskript kann das eigentliche
Mac-Skript direkt importieren. Beide Funktionen schreiben atomar über eine Temp-Datei mit anschließendem Umbenennen.

## Hinweise

* Bei „Merken“ speichert die App nur den **abgeleiteten Schlüssel** im `localStorage` und nie das Passwort.
  Ändert sich das Salt (Neustart des Mac-Skripts), fragt die App nach dem Neuladen einmal erneut nach dem Passwort.
* Benachrichtigungen (🔔) kommen nur, solange die App offen ist oder im Hintergrund läuft. Ohne Push-Server gibt es keine Benachrichtigungen bei geschlossener App.
  Auf dem iPhone funktionieren sie erst, nachdem die App zum Home-Bildschirm hinzugefügt wurde (iOS ≥ 16.4).
* Liegt der Feed im Repo (`feed/`), braucht jedes Update einen Push und einen Pages-Deploy (≈ 0,5–2 min).
  GitHub Pages erlaubt außerdem nur etwa 10 Deploys pro Stunde. Für Live-Daten deshalb den Feed vom Mac ausliefern (siehe unten).

## Live-Feed direkt vom Mac (Tailscale Funnel)

Die App bleibt auf GitHub Pages, nur `status.enc` und `img/` kommen per HTTPS direkt vom Mac.

1. **Tailscale installieren und anmelden:** `brew install --cask tailscale` oder die App aus dem Mac App Store.
2. **Feed-Server starten:** `python3 tools/serve_feed.py --dir /pfad/zum/feed` lauscht nur lokal auf `127.0.0.1:8787`.
   Ausgeliefert werden ausschließlich `/status.enc` und `/img/<hash>.bin`.
3. **Funnel einschalten:** `tailscale funnel --bg 8787`. Beim ersten Mal gibt der Befehl einen Link aus, um Funnel
   und HTTPS für das Tailnet freizuschalten. Danach steht dort die Adresse, z. B. `https://mein-mac.tail1234.ts.net/`.
   `--bg` merkt sich die Einstellung auch über Neustarts.
4. **Adresse in die App eintragen:** auf dem Handy im Anmeldebildschirm unter „Feed-Adresse“ oder dauerhaft in `config.js`.
5. **Autostart (optional):** `tools/de.macray.feed.plist` anpassen und nach `~/Library/LaunchAgents/` kopieren
   (Anleitung steht in der Datei).
6. **Ruhezustand verhindern:** Der Mac darf nicht schlafen, z. B. Systemeinstellungen → Energie oder `caffeinate -s`.

Ist der Mac nicht erreichbar, zeigt die App einen gelben Hinweis und behält den letzten Stand.
