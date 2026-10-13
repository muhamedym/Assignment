// Checks the hosted (installable) version: manifest, offline support, and that the app still works offline.
// Usage: node dev/tests/site.test.mjs   (serves play-store/site on a local port)
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright/index.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, "../../play-store/site");
const MOCK = fs.readFileSync(path.join(here, "mock-speech.js"), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  if (p === "/.well-known/assetlinks.json") p = "/assetlinks.json"; // same rewrite as _redirects
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}/`;
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n    " + e.message.split("\n").slice(0, 8).join(" ")); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36", hasTouch: true, isMobile: true });
await ctx.addInitScript(MOCK);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed++; console.log("  ✗ page error: " + e.message); });
console.log("Hosted app (installable version)\n");
await page.goto(base);

await check("manifest is valid for an installable Android app", async () => {
  const m = await (await page.request.get(base + "manifest.webmanifest")).json();
  assert.equal(m.name, "Spelling Dictation for IELTS Practice");
  assert.equal(m.display, "standalone");
  for (const ic of m.icons) assert.equal((await page.request.get(base + ic.src)).status(), 200, ic.src);
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  assert.equal(await page.getAttribute('link[rel="manifest"]', "href"), "manifest.webmanifest");
});
await check("offline support is installed", async () => {
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
});
await check("app opens and works with no internet", async () => {
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await page.check("input[name=mode][value=personal]");
  await page.click("#btnStart");
  await page.waitForFunction(() => window.__speechLog.filter((x) => x.ev === "start").length >= 2);
  const w = await page.evaluate(() => { const s = window.__ielts.session; return s.items[s.rounds[0].queue[s.pos]].word; });
  await page.fill("#answer", w); await page.click("#btnSubmit");
  assert.match(await page.textContent("#feedback"), /Correct/);
  await ctx.setOffline(false);
});
await check("designer credit and About section are shown", async () => {
  assert.match(await page.textContent("footer.credit"), /Designed by Mohammed Mohammed/);
  await page.click("#aboutLink");
  assert.match(await page.textContent("#about"), /Designed by Mohammed Mohammed[\s\S]*All rights reserved[\s\S]*Not affiliated/);
});
await check("Android voice help and phone layout (no sideways scrolling, keyboard hints hidden)", async () => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".controls .keys")).display), "none");
  // touch hint shown, keyboard hint hidden
  assert.deepEqual(await page.evaluate(() => [".touchhint", ".keyhint"].map((q) => getComputedStyle(document.querySelector(q)).display !== "none")), [true, false]);
  assert.equal(await page.getAttribute("#answer", "enterkeyhint"), "go");
});
await check("privacy policy and app-link file are served", async () => {
  assert.equal((await page.request.get(base + "privacy.html")).status(), 200);
  assert.equal((await page.request.get(base + ".well-known/assetlinks.json")).status(), 200);
});
await browser.close(); server.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
