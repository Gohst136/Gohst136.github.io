#!/usr/bin/env python3
"""Mini-Webserver, der den verschlüsselten Feed direkt vom Mac ausliefert.

    python3 tools/serve_feed.py                     # Ordner ../feed auf 127.0.0.1:8787
    python3 tools/serve_feed.py -d ~/macray/feed -p 8787

Davor schaltet man Tailscale Funnel (öffentliche HTTPS-Adresse -> dieser Port):

    tailscale funnel --bg 8787

Ausgeliefert werden NUR  /status.enc  und  /img/<hex>.bin  – keine Verzeichnislisten,
keine anderen Dateien. Der Inhalt ist verschlüsselt; CORS ist für die PWA auf
GitHub Pages freigegeben.
"""

import argparse
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ALLOWED = re.compile(r"^/(status\.enc|img/[0-9a-fA-F]{8,64}\.bin)$")


def make_handler(feed_dir: str, origins: list[str], quiet: bool):
    class Handler(BaseHTTPRequestHandler):
        server_version = "macray-feed"
        sys_version = ""

        def _cors(self):
            origin = self.headers.get("Origin")
            if "*" in origins:
                self.send_header("Access-Control-Allow-Origin", "*")
            elif origin in origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _send(self, head_only: bool):
            path = self.path.split("?", 1)[0]
            m = ALLOWED.match(path)
            file = os.path.join(feed_dir, *m.group(1).split("/")) if m else None
            if not file or not os.path.isfile(file):
                self.send_response(404)
                self._cors()
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            with open(file, "rb") as f:
                data = f.read()
            self.send_response(200)
            self._cors()
            if path == "/status.enc":
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
            else:
                # Bildnamen sind Inhalts-Hashes -> dürfen ewig gecacht werden
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if not head_only:
                self.wfile.write(data)

        def do_GET(self):
            self._send(False)

        def do_HEAD(self):
            self._send(True)

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Max-Age", "86400")
            self.end_headers()

        def log_message(self, fmt, *args):
            if not quiet:
                sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    return Handler


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Liefert den MacRay-Feed aus (für Tailscale Funnel).")
    ap.add_argument("-d", "--dir", default=os.path.join(here, "..", "feed"), help="Feed-Ordner (Standard: ../feed)")
    ap.add_argument("-p", "--port", type=int, default=8787, help="Port (Standard: 8787)")
    ap.add_argument("--bind", default="127.0.0.1", help="Adresse (Standard: 127.0.0.1 – nur lokal, Funnel reicht durch)")
    ap.add_argument("--origin", action="append",
                    help="erlaubter CORS-Origin, mehrfach möglich (Standard: *; z. B. https://gohst136.github.io)")
    ap.add_argument("-q", "--quiet", action="store_true", help="keine Zugriffe protokollieren")
    args = ap.parse_args()

    feed_dir = os.path.abspath(os.path.expanduser(args.dir))
    if not os.path.isdir(feed_dir):
        sys.exit(f"Feed-Ordner nicht gefunden: {feed_dir}")
    origins = args.origin or ["*"]

    httpd = ThreadingHTTPServer((args.bind, args.port), make_handler(feed_dir, origins, args.quiet))
    print(f"Feed {feed_dir} auf http://{args.bind}:{args.port}/status.enc  (CORS: {', '.join(origins)})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
