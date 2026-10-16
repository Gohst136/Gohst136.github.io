#!/usr/bin/env python3
"""Erzeugt einen verschlüsselten Beispiel-Feed für die MacRay-Status-App.

    python3 tools/make_test_feed.py              # Passwort "test", schreibt nach ./feed
    python3 tools/make_test_feed.py -p geheim -o /pfad/zu/feed

Format (muss exakt zu app.js passen):
  feed/status.enc   JSON {"v":1,"iter":N,"salt":b64,"iv":b64,"ct":b64,"mac":b64}
  feed/img/<h>.bin  iv(16) || ct || mac(32)

  PBKDF2-HMAC-SHA256(passwort, salt, iter) -> 64 Bytes
      [0:32]  AES-256-CBC-Schlüssel (PKCS7-Padding)
      [32:64] HMAC-SHA256-Schlüssel, mac = HMAC(iv || ct)

AES kommt aus dem Paket "cryptography" (pip install cryptography); fehlt es,
wird das openssl-Kommandozeilenwerkzeug benutzt (auf macOS vorinstalliert).
Für das Testbild wird Pillow benutzt, falls vorhanden – sonst ein eingebettetes Mini-JPEG.

Die Funktionen derive_keys / seal / write_status / write_image lassen sich auch
direkt aus dem eigentlichen Mac-Skript importieren.
"""

import argparse
import base64
import hashlib
import hmac
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta

DEFAULT_ITER = 200_000

# 32x24-Pixel-JPEG als Ersatz, falls Pillow nicht installiert ist.
FALLBACK_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkYo6uRR0RR1cijrvnMywtQIo6uRR0kUdXIo646kz6TC1DHijq5FHRRVVGz47CyZcijq5FHRRXHUbPpcLJn//Z"
)


# --------------------------------------------------------------------------
# Kryptografie
# --------------------------------------------------------------------------

def derive_keys(password: str, salt: bytes, iterations: int) -> tuple[bytes, bytes]:
    """PBKDF2-SHA256 -> (aes_key, mac_key), je 32 Bytes."""
    raw = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=64)
    return raw[:32], raw[32:]


def _aes_cbc_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    try:
        from cryptography.hazmat.primitives import padding
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    except ImportError:
        # Fallback: openssl enc (PKCS7-Padding ist dort Standard)
        return subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-K", key.hex(), "-iv", iv.hex()],
            input=plaintext, stdout=subprocess.PIPE, check=True,
        ).stdout
    padder = padding.PKCS7(128).padder()
    data = padder.update(plaintext) + padder.finalize()
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    return enc.update(data) + enc.finalize()


def seal(keys: tuple[bytes, bytes], plaintext: bytes) -> tuple[bytes, bytes, bytes]:
    """Verschlüsselt und signiert -> (iv, ct, mac)."""
    aes_key, mac_key = keys
    iv = os.urandom(16)
    ct = _aes_cbc_encrypt(aes_key, iv, plaintext)
    mac = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    return iv, ct, mac


def _atomic_write(path: str, data: bytes) -> None:
    """Erst in Temp-Datei schreiben, dann umbenennen – die App sieht nie halbe Dateien."""
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def write_status(feed_dir: str, keys, salt: bytes, iterations: int, status: dict) -> None:
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    iv, ct, mac = seal(keys, json.dumps(status, ensure_ascii=False).encode("utf-8"))
    box = {"v": 1, "iter": iterations, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct), "mac": b64(mac)}
    _atomic_write(os.path.join(feed_dir, "status.enc"), json.dumps(box).encode("ascii"))


def write_image(feed_dir: str, keys, jpeg: bytes) -> str:
    """Verschlüsselt ein JPEG nach feed/img/<hash>.bin, liefert den relativen Pfad "img/<hash>.bin"."""
    name = hashlib.sha256(jpeg).hexdigest()[:20] + ".bin"
    img_dir = os.path.join(feed_dir, "img")
    os.makedirs(img_dir, exist_ok=True)
    path = os.path.join(img_dir, name)
    if not os.path.exists(path):   # gleicher Inhalt -> gleicher Name, nicht neu schreiben
        iv, ct, mac = seal(keys, jpeg)
        _atomic_write(path, iv + ct + mac)
    return "img/" + name


# --------------------------------------------------------------------------
# Beispieldaten
# --------------------------------------------------------------------------

def make_test_jpeg() -> bytes:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return FALLBACK_JPEG
    import math
    w, h = 640, 400
    im = Image.new("RGB", (w, h), (13, 17, 23))
    d = ImageDraw.Draw(im)
    # „Spektrogramm“-artiges Testbild
    for x in range(0, w, 4):
        for y in range(0, h, 4):
            v = (math.sin(x / 37.0) * math.cos(y / 23.0) + math.sin((x + y) / 51.0)) * 0.5 + 0.5
            v *= 1 - y / h * 0.6
            d.rectangle([x, y, x + 3, y + 3], fill=(int(40 + 200 * v), int(30 + 120 * v * v), int(90 + 120 * (1 - v))))
    d.rectangle([0, h - 40, w, h], fill=(0, 0, 0))
    d.text((12, h - 30), "MacRay Testbild  " + datetime.now().strftime("%H:%M:%S"), fill=(230, 237, 243))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def iso(t: datetime) -> str:
    return t.replace(microsecond=0).isoformat()


def make_status(image_file: str) -> dict:
    now = datetime.now()
    hm = lambda t: t.strftime("%H:%M")
    return {
        "updated": iso(now),
        "jobs": [
            {"name": "train_unet_v7", "state": "running", "kind": "train",
             "started": iso(now - timedelta(hours=2, minutes=10)), "updated": iso(now - timedelta(seconds=40)),
             "step": 6200, "steps": 10000, "progress": 0.62,
             "eta": iso(now + timedelta(hours=1, minutes=17)), "val_l1": 0.04213},
            {"name": "aufnahme_raum_B", "state": "retrying", "kind": "record",
             "started": iso(now - timedelta(minutes=12)), "updated": iso(now - timedelta(minutes=1)),
             "step": 3, "steps": 12, "progress": 0.25,
             "eta": iso(now + timedelta(minutes=9, seconds=30)), "val_l1": None},
            {"name": "train_unet_v6", "state": "done", "kind": "train",
             "started": iso(now - timedelta(hours=6)), "updated": iso(now - timedelta(hours=2, minutes=15)),
             "step": 10000, "steps": 10000, "progress": 1.0,
             "eta": iso(now - timedelta(hours=2, minutes=15)), "val_l1": 0.04577},
            {"name": "train_tiny_ablation", "state": "FAILED", "kind": "train",
             "started": iso(now - timedelta(hours=3)), "updated": iso(now - timedelta(hours=2, minutes=50)),
             "step": 410, "steps": 5000, "progress": 0.082,
             "eta": None, "val_l1": None},
        ],
        "autopilot": {"round": 7,
                      "best_name": "train_unet_v6", "best_score": 1.84,
                      "k_best_name": "train_tiny_ablation", "k_best_score": -0.37},
        "plan": [
            {"step": "Aufnahme Raum A", "state": "done", "eta": iso(now - timedelta(hours=5))},
            {"step": "Training v6", "state": "done", "eta": iso(now - timedelta(hours=2, minutes=15))},
            {"step": "Aufnahme Raum B", "state": "running", "eta": iso(now + timedelta(minutes=10))},
            {"step": "Training v7", "state": "running", "eta": iso(now + timedelta(hours=1, minutes=17))},
            {"step": "Auswertung + Bericht", "state": "todo", "eta": iso(now + timedelta(hours=1, minutes=40))},
        ],
        "notes": [
            f"{hm(now - timedelta(minutes=1))} Aufnahme Raum B: Mikrofon-Timeout, neuer Versuch 2/3",
            f"{hm(now - timedelta(minutes=12))} Aufnahme Raum B gestartet",
            f"{hm(now - timedelta(hours=2, minutes=15))} Training v6 fertig, val L1 0.04577 (+1.84 dB)",
            f"{hm(now - timedelta(hours=2, minutes=50))} train_tiny_ablation abgebrochen: NaN im Loss",
            f"{hm(now - timedelta(hours=5))} Aufnahme Raum A fertig",
        ],
        "images": [
            {"file": image_file, "caption": "Spektrogramm v7, Schritt 6200", "time": iso(now - timedelta(minutes=3))},
        ],
    }


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-p", "--password", default="test", help='Passwort (Standard: "test")')
    ap.add_argument("-o", "--out", default=os.path.join(here, "..", "feed"), help="Feed-Ordner (Standard: ../feed)")
    ap.add_argument("-i", "--iter", type=int, default=DEFAULT_ITER, help=f"PBKDF2-Iterationen (Standard: {DEFAULT_ITER})")
    args = ap.parse_args()

    feed = os.path.abspath(args.out)
    os.makedirs(feed, exist_ok=True)

    salt = os.urandom(16)
    keys = derive_keys(args.password, salt, args.iter)

    image_file = write_image(feed, keys, make_test_jpeg())
    write_status(feed, keys, salt, args.iter, make_status(image_file))

    print(f"Feed geschrieben nach {feed}")
    print(f"  status.enc + {image_file}  (Passwort: {args.password!r}, {args.iter} Iterationen)")


if __name__ == "__main__":
    sys.exit(main())
