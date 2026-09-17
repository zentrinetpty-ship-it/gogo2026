#!/usr/bin/env python3
"""GOGO full-stack backup -> a single zip on the Desktop.

Zips the live app, the React landing source, its build output and the Caddy
config. node_modules is excluded: it is ~500MB of reproducible packages that
`npm install` restores, so including it would make the archive useless for
sending and pointless for restoring.
"""
import os
import shutil
import socket
import zipfile
from datetime import datetime
from pathlib import Path

HOME = Path(os.path.expanduser("~"))
SRC = HOME / "gogo"
DESKTOP = HOME / "Desktop"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
NAME = f"gogo-fullstack-{STAMP}"
OUT = DESKTOP / f"{NAME}.zip"

# never ship packages, logs, or the OS's junk
SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".vite", "_build", "dist"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}
SKIP_EXT = {".log"}

INFO = f"""GOGO full-stack backup
======================
Taken      : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Host       : {socket.gethostname()}
Taken from : {SRC}

WHAT IS IN HERE
---------------
gogo/                      the live app, served by Caddy at /gogo/
  *.html                   17 pages (app, rides, ride, parcel, rider, driver,
                           messages, track, why, safety, terms, privacy,
                           auth, ops, more, 404, gogo2)
  assets/                  every app script and stylesheet
  images, fonts, _app/     icons, Anton, and the built landing bundle
  gogohermes/              the React + Vite source for the landing page
  server.js                local dev server on :3020

caddy/Caddyfile            the config that serves the site

HOW TO RUN IT AGAIN
-------------------
The landing source:
    cd gogo/gogohermes
    npm install          (node_modules was excluded from this zip)
    node ./node_modules/vite/bin/vite.js build      # writes to gogohermes/_build

Deploy the landing (it is copied, not symlinked):
    cp -r gogohermes/_build/{{index.html,_app,fonts}} ../

Serve locally:
    cd gogo && node server.js        ->  http://127.0.0.1:3020

Caddy:
    caddy reload --config C:/caddy/Caddyfile --adapter caddyfile
    The /gogo/* block file_servers C:/Users/Administrator/gogo.
    Keep ONE handle_path for /gogo/* — extra matchers break the assets.

NOTES
-----
- node_modules is NOT included (reproducible with npm install).
- Bookings and drafts live in the browser's localStorage, not in this repo.
- Maps use keyless ArcGIS tiles; address lookup uses keyless Nominatim.
"""


def wanted(path: Path) -> bool:
    if path.name in SKIP_FILES or path.suffix in SKIP_EXT:
        return False
    return True


def main():
    if not SRC.is_dir():
        raise SystemExit(f"source not found: {SRC}")

    files = []
    for root, dirs, names in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            p = Path(root) / n
            if wanted(p):
                files.append(p)

    caddy = Path("C:/caddy/Caddyfile")
    if caddy.is_file():
        files.append(caddy)
    else:
        print("   (Caddyfile not found, skipping)")

    print(f"==> {len(files)} files to archive")
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr(f"{NAME}/BACKUP-INFO.txt", INFO)
        for f in files:
            if f == caddy:
                z.write(f, f"{NAME}/caddy/Caddyfile")
            else:
                z.write(f, f"{NAME}/{f.relative_to(HOME)}")
        print("==> archive written")

    mb = OUT.stat().st_size / (1024 * 1024)
    print(f"\ndone: {OUT}")
    print(f"size: {mb:.1f} MB   files: {len(files) + 1}")


if __name__ == "__main__":
    main()
