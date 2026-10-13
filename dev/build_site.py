"""Build play-store/site: the hosted version of the app that becomes the Android app.

Usage:  python -I dev/build_site.py      (after dev/build.py and dev/make_icons.py)
Upload the whole play-store/site folder to Netlify (or Cloudflare Pages).
"""
import hashlib
import json
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parent.parent
site = root / "play-store" / "site"
app = (root / "IELTS-Spelling-Dictation" / "IELTS-Spelling-Dictation.html").read_text(encoding="utf-8")
(site / "index.html").write_text(app, encoding="utf-8")

NAME = "Spelling Dictation for IELTS Practice"
manifest = {
    "id": "/", "name": NAME, "short_name": "Spelling Dictation",
    "description": "Hear a word, type it, and learn its spelling, meaning and word family. Works offline.",
    "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any", "lang": "en-US", "dir": "ltr",
    "background_color": "#f6f7f9", "theme_color": "#1f5fbf", "categories": ["education"],
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(site / "manifest.webmanifest").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

files = ["./", "index.html", "privacy.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"]
version = hashlib.sha256(app.encode()).hexdigest()[:10]
(site / "sw.js").write_text(f"""// Offline support: keeps the app working with no internet. New version = new cache name.
const CACHE = "spelling-dictation-{version}";
const FILES = {json.dumps(files)};
self.addEventListener("install", (e) => {{ e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener("activate", (e) => {{
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
}});
// Cached copy first (fast, offline); refresh it in the background when online.
self.addEventListener("fetch", (e) => {{
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {{
    const hit = await c.match(e.request, {{ ignoreSearch: true }});
    const net = fetch(e.request).then((r) => {{ if (r.ok) c.put(e.request, r.clone()); return r; }}).catch(() => hit);
    return hit || net;
  }}));
}});
""", encoding="utf-8")

# Netlify / Cloudflare Pages: serve the Android app-link file from /.well-known (dot-folders can be skipped on upload)
(site / "_redirects").write_text("/.well-known/assetlinks.json  /assetlinks.json  200\n", encoding="utf-8")
(site / "_headers").write_text("/assetlinks.json\n  Content-Type: application/json\n/sw.js\n  Cache-Control: no-cache\n", encoding="utf-8")
if not (site / "assetlinks.json").exists():
    (site / "assetlinks.json").write_text("[]\n", encoding="utf-8")  # replaced with the file PWABuilder gives you
print(f"site built (cache version {version})")
