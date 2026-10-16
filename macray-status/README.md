# MacRay Status

Installierbare Web-App (PWA) zur Anzeige des Job-Status vom Mac. Sie kommt ohne Build-Schritt aus und besteht nur aus HTML, CSS und JS.
Alle Daten liegen **verschlüsselt** in `feed/` und werden erst im Browser mit dem Passwort entschlüsselt
(Web Crypto: PBKDF2-SHA256 → AES-256-CBC + HMAC-SHA256).

| Datei | Zweck |
|---|---|
| `index.html`, `style.css`, `app.js` | die App |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (Homescreen, offline-fähige Hülle) |
| `feed/status.enc`, `feed/img/*.bin` | verschlüsselter Feed (vom Mac hochgeladen) |
| `tools/make_test_feed.py` | erzeugt einen Beispiel-Feed (Passwort `test`) |

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
* GitHub Pages cacht Dateien bis zu ~10 min im CDN. `?t=…` umgeht nur den Browser-Cache.
