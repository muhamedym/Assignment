// End-to-end tests for the dictation app, run in headless Chromium against the real file:// page.
// Usage: node dev/tests/e2e.test.mjs   (needs Playwright; PLAYWRIGHT_PATH can point to it)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright/index.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const APP = path.join(root, "IELTS-Spelling-Dictation", "IELTS-Spelling-Dictation.html");
const MOCK = fs.readFileSync(path.join(here, "mock-speech.js"), "utf8");
const exe = fs.existsSync("/opt/pw-browsers/chromium") ? undefined : undefined;

// "Your earlier spelling" column of the document: none of these may ever be an accepted answer.
const EARLIER = ["expen dature", "demonistrate", "comparision", "steadly", "simillarly", "chieldren", "childen", "somtimes",
  "necessarly", "obserbed", "emmited", "repetative", "clorourful", "princible", "highley", "writting"];

let passed = 0, failed = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;   // ONLY="Sounds" runs just the matching tests
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n      ")); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ielts-e2e-"));

// Simulated online dictionaries (no internet in the test environment). Responses follow the documented
// formats of api.dictionaryapi.dev, the Wiktionary REST API, the MediaWiki (Wikipedia) API and api.datamuse.com.
const DICT = {
  youngster: [{ word: "youngster", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A young person." }] }] }],
  blorft: [{ word: "blorft", meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "(transitive) To test something online.", example: "We blorft the app every day." }] }] }],
  saturday: [{ word: "Saturday", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "The day of the week following Friday." }] }] }],
};
const WIKTIONARY = {
  flimble: { en: [{ partOfSpeech: "Verb", language: "English", definitions: [{ definition: "(<i>intransitive</i>) To wobble gently.",
    examples: ["It was a cold and windy night in the small village by the sea, and everyone stayed indoors. The old bridge would <b>flimble</b> in the wind every winter."] }] }] },
};
const WIKIPEDIA = {   // search results and article texts, by word / title
  search: { youngster: ["Youngster (film)", "Swimming lessons", "Football club"] },
  pages: {
    "Swimming lessons": "Swimming lessons are classes that teach people how to swim.\nThe youngster learned to swim at the local pool in only two weeks.\nIn 1998, Youngster Club opened a pool.",
    "Football club": "Every youngster in the town wanted to join the new football club. The club has 300 members.",
  },
};
const MUSE = {   // by query: sp=…, rel_syn=…, ml=…
  "sp=doubtedly": [{ word: "undoubtedly", score: 900 }, { word: "doubtfully", score: 300 }],
  "sp=doubted*": [{ word: "doubted", tags: ["adj", "f:3"] }],
  "sp=zorbl": [{ word: "zorbl", defs: ["n\ta made-up test word"] }],
  "rel_syn=blorft": [{ word: "probe" }, { word: "check" }],
};
async function mockLookup(ctx, mode = "mock") {
  const log = [];
  await ctx.route(/https:\/\/(api\.dictionaryapi\.dev|api\.datamuse\.com|en\.wiktionary\.org|(simple|en)\.wikipedia\.org)\//, async (route) => {
    const u = new URL(route.request().url()); log.push(decodeURIComponent(u.href));
    if (mode === "offline") return route.abort("internetdisconnected");
    const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };
    const json = (status, body) => route.fulfill({ status, headers, body: JSON.stringify(body) });
    const last = decodeURIComponent(u.pathname.split("/").pop());
    if (u.host === "api.dictionaryapi.dev") return DICT[last] ? json(200, DICT[last]) : json(404, { title: "No Definitions Found" });
    if (u.host === "en.wiktionary.org") return WIKTIONARY[last] ? json(200, WIKTIONARY[last]) : json(404, {});
    if (u.host.endsWith("wikipedia.org")) {
      if (u.searchParams.get("list") === "search") return json(200, { query: { search: (WIKIPEDIA.search[u.searchParams.get("srsearch")] || []).map((title) => ({ title })) } });
      const t = u.searchParams.get("titles");
      return json(200, { query: { pages: { 1: { title: t, extract: WIKIPEDIA.pages[t] || "" } } } });
    }
    const key = ["sp", "rel_syn", "ml"].filter((k) => u.searchParams.has(k)).map((k) => k + "=" + u.searchParams.get(k))[0];
    return json(200, MUSE[key] || []);
  });
  return log;
}

async function openApp(ctx, cfg = {}, file = APP) {
  if (!ctx.__lookupLog) ctx.__lookupLog = await mockLookup(ctx, cfg.lookup);
  const page = await ctx.newPage();
  await page.addInitScript(`window.__mockCfg = ${JSON.stringify(cfg)};\n${MOCK}`);
  page.on("pageerror", (e) => { throw new Error("Page error: " + e.message); });
  page.on("dialog", (d) => d.accept());
  await page.goto(pathToFileURL(file).href);
  return page;
}
const spoken = (page) => page.evaluate(() => window.__speechLog.filter((x) => x.ev === "start").map((x) => Object.assign(x, { text: x.text.replace(/\.$/, "") })));
async function waitSpoken(page, n, timeout = 8000) {
  await page.waitForFunction((n) => window.__speechLog.filter((x) => x.ev === "start").length >= n, n, { timeout });
}
const sess = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__ielts.session)));
const current = (page) => page.evaluate(() => { const s = window.__ielts.session; const r = s.rounds[s.rounds.length - 1]; return s.items[r.queue[s.pos]]; });
// Always a letter substitution, so both "wrong" and "fix" highlights must appear.
const misspell = (w) => w[0] + (w[1].toLowerCase() === "q" ? "z" : "q") + w.slice(2);

async function setMode(page, mode, length, sub) {
  if (mode === "task1" || mode === "task2") { sub = mode; mode = "writing"; } // Writing Task 1/2 are parts of Academic Writing
  await page.check(`input[name=mode][value=${mode}]`);
  if (sub !== undefined) await page.selectOption("#sub", sub);
  await page.selectOption("#length", String(length));
}

const browser = await chromium.launch({ headless: true });
console.log("IELTS Spelling Dictation — end-to-end tests\n");

await test("vocabulary: 80 document words + 369 high-frequency listening words + 98 reading words from the 4 tables, no earlier misspellings, no duplicates", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  const v = await page.evaluate(() => window.__ielts.poolFor("mixed"));
  assert.equal(v.length, 547);
  const counts = {}; for (const x of v) counts[x.cat] = (counts[x.cat] || 0) + 1;
  assert.deepEqual(counts, { personal: 15, listening: 25, task1: 20, task2: 20, hf: 369, reading: 98 });
  const words = v.map((x) => x.word.toLowerCase());
  assert.equal(new Set(words).size, words.length, "duplicates found");
  const hf = v.filter((x) => x.cat === "hf");
  for (const w of ["librarian", "catalog", "alumni", "alumnus", "waiter", "waitress", "anesthetist", "plow through", "call on someone",
    "join someone for dinner", "have no match for", "dropout", "stationery", "landlady", "fridge", "air conditioner", "SARS", "go Dutch"])
    assert.ok(hf.some((x) => x.word === w), "high-frequency word missing: " + w);
  for (const bad of ["catalogue", "anaesthetist", "plough through", "call on sb.", "alumni/alumnus", "have no match for…"])
    assert.ok(!words.includes(bad), "uncleaned entry kept: " + bad);
  assert.ok(!hf.some((x) => ["receipt", "professor", "opportunity", "apartment", "maintenance"].includes(x.word)), "duplicate of an existing word");
  assert.equal(hf.find((x) => x.word === "librarian").group, "School › Library");
  assert.match(hf.find((x) => x.word === "stationery").context, /paper and pens/);
  for (const bad of EARLIER) assert.ok(!words.includes(bad), "earlier misspelling included: " + bad);
  for (const w of ["expenditure", "necessarily", "colorful", "accommodation", "questionnaire", "remain stable", "respectively", "although", "Wednesday"])
    assert.ok(v.some((x) => x.word === w), "missing " + w);
  for (const bad of ["Correct spelling", "Word or phrase", "Word", "Remember", "Example"]) assert.ok(!v.some((x) => x.word === bad), "header leaked: " + bad);
  assert.ok(!v.some((x) => /[.…/；]/.test(x.word) || x.word.split(" ").length > 5), "a sentence or unsplit entry leaked into answers");
  assert.ok(!words.some((w) => /colour|behaviour|centre/.test(w)), "UK spelling present");
  const exp = v.find((x) => x.word === "expenditure");
  assert.equal(exp.hint, "expend + iture");
  assert.equal(v.find((x) => x.word === "accommodation").group, "Bookings");
  assert.match(v.find((x) => x.word === "remain stable").example, /remained stable/);
  await ctx.close();
});

await test("answer checking ignores case and extra spaces but not letters or endings", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  const r = await page.evaluate(() => {
    const c = window.__ielts.isCorrect;
    return [c("  Remain   STABLE ", "remain stable"), c("wednesday", "Wednesday"), c("remain stables", "remain stable"),
      c("steadly", "steadily"), c("increased", "increase"), c("remainstable", "remain stable"), c("colour", "colorful"),
      c("full time job", "full-time job"), c("fulltime job", "full-time job"), c("hard-working", "hardworking"), c("ful-time job", "full-time job"),
      c("hitch hike", "hitchhike"), c("roundtrip", "round-trip"), c("round trip", "round-trip")];
  });
  assert.deepEqual(r, [true, true, false, false, false, false, false, true, true, true, false, false, true, true]);
  await ctx.close();
});

await test("voices load late; the clearest US voice (Natural) is chosen by default and labelled; local voices still listed", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx, { voiceDelay: 1200 });
  await page.waitForFunction(() => document.querySelector("#voiceStatus").textContent.includes("Voice ready"));
  const opts = await page.$$eval("#voice option", (o) => o.map((x) => x.textContent));
  assert.match(opts[0], /^★ Microsoft Aria Online \(Natural\).*clearest, online, needs internet/);
  assert.match(await page.textContent("#voiceStatus"), /clearest.*online.*switches to the local voice/s);
  assert.ok(opts.some((o) => /Zira.*local, works offline/.test(o)));
  assert.ok(opts.some((o) => /George/.test(o)) && !opts.some((o) => /Hedda/.test(o)), "non-English voice listed");
  assert.equal(await page.isDisabled("#btnStart"), false);
  await page.selectOption("#voice", { label: opts.find((o) => /Zira/.test(o)) });
  assert.match(await page.textContent("#voiceStatus"), /local voice that works offline.*clearer pronunciation/s);
  await page.click("#btnTestVoice");
  await waitSpoken(page, 1);
  assert.match((await spoken(page))[0].text, /Hello/);
  await ctx.close();
});

let missedWords = [];
await test("full session: start → hear twice → type → Enter → feedback; corrections required and not counted; retest only missed", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "personal", 5);
  await page.click("#btnStart");

  // Q1: heard twice with a pause, nothing revealed, focus in the answer box.
  await waitSpoken(page, 2);
  let it = await current(page);
  const log = await page.evaluate(() => window.__speechLog);
  const starts = await spoken(page), end1 = log.find((x) => x.ev === "end");
  assert.equal(starts[0].text, it.word); assert.equal(starts[1].text, it.word);
  assert.ok(starts[1].t - end1.t >= 900, `pause between readings too short: ${starts[1].t - end1.t}ms`);
  const visible = (await page.innerText("#dictation")).toLowerCase() + (await page.title()).toLowerCase();
  assert.ok(!visible.includes(it.word.toLowerCase()), "word visible before answering");
  if (it.hint) assert.ok(!visible.includes(it.hint.toLowerCase()), "hint visible before answering");
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer");
  assert.match(await page.textContent("#qnum"), /Question 1 of 5/);
  assert.match(await page.textContent("#qcat"), /Personal spelling priorities/);

  // Correct → confirmation → automatic advance.
  await page.keyboard.type(it.word.toUpperCase() + "  ");
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#feedback"), /✓ Correct/);
  await page.waitForFunction(() => /Question 2 of 5/.test(document.querySelector("#qnum").textContent), null, { timeout: 7000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer");
  await waitSpoken(page, 4);

  // Q2: wrong → shows answer + correct + highlighted differences; must correct before moving on.
  it = await current(page);
  const wrong = misspell(it.word);
  await page.keyboard.type(wrong); await page.keyboard.press("Enter");
  const fb = await page.textContent("#feedback");
  assert.match(fb, /Not quite/); assert.ok(fb.includes(wrong) && fb.includes(it.word));
  assert.ok(await page.$$eval("#feedback .cells .wrong", (e) => e.length) >= 1, "no highlighted wrong letters");
  assert.ok(await page.$$eval("#feedback .cells .fix", (e) => e.length) >= 1, "no highlighted correct letters");
  assert.match(fb, /Differences: wrong letter/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer");
  await page.keyboard.press("Enter"); // empty Enter does not advance
  await page.keyboard.type(wrong); await page.keyboard.press("Enter"); // still wrong
  assert.match(await page.textContent("#feedback"), /still not right/);
  await page.waitForTimeout(1600);
  assert.match(await page.textContent("#qnum"), /Question 2 of 5/, "advanced without a correction");
  await page.keyboard.type(it.word); await page.keyboard.press("Enter");
  assert.match(await page.textContent("#feedback"), /corrected/);
  assert.match(await page.textContent("#feedback"), /still counts as incorrect/);
  missedWords.push(it.word);
  await page.waitForFunction(() => /Question 3 of 5/.test(document.querySelector("#qnum").textContent));
  let s = await sess(page);
  assert.equal(s.rounds[0].results[1].correct, false, "correction changed the original result");
  assert.equal(s.rounds[0].results[1].answer, wrong);

  // Q3: Repeat pressed repeatedly never overlaps or queues speech, and reveals nothing.
  await waitSpoken(page, 6);
  it = await current(page);
  const before = (await spoken(page)).length;
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Alt+r"); await page.waitForTimeout(i % 2 ? 40 : 300); }
  await page.click("#btnRepeat");
  await page.waitForTimeout(900);
  const st = await page.evaluate(() => window.__speechStats);
  assert.equal(st.queuedWhileBusy, 0, "speech was queued behind other speech");
  assert.ok((await spoken(page)).length > before, "repeat produced no speech");
  assert.ok((await spoken(page)).slice(before).every((x) => x.text === it.word || x.text === it.context)); // sound-alikes also get their spoken meaning
  assert.ok(!(await page.innerText("#dictation")).toLowerCase().includes(it.word.toLowerCase()), "repeat revealed the word");
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer", "clicking Repeat stole focus");
  await page.keyboard.press("Alt+s");
  await page.waitForTimeout(400);
  const slow = (await spoken(page)).at(-1);
  assert.ok(slow.rate < 0.9, "slow repeat not slower: " + slow.rate);

  // Pause and resume keep the same question and the partly typed answer.
  await page.keyboard.type("par");
  await page.keyboard.press("Escape");
  assert.ok(await page.isVisible("#pausedArea")); assert.ok(!(await page.isVisible("#answer")));
  const cancelsAtPause = (await page.evaluate(() => window.__speechStats.cancels));
  const nBefore = (await spoken(page)).length;
  await page.waitForTimeout(500);
  assert.equal((await spoken(page)).length, nBefore, "speech continued while paused");
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#qnum"), /Question 3 of 5/);
  assert.equal(await page.inputValue("#answer"), "par");
  assert.equal((await current(page)).word, it.word);
  await waitSpoken(page, nBefore + 1);
  assert.ok(cancelsAtPause > 0);
  await page.fill("#answer", "");

  // Q3 wrong, Q4 correct, Q5 wrong (first answers), with corrections.
  await page.keyboard.type(misspell(it.word)); await page.keyboard.press("Enter");
  missedWords.push(it.word);
  await page.keyboard.type(it.word); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Question 4 of 5/.test(document.querySelector("#qnum").textContent));
  it = await current(page);
  await page.keyboard.type(it.word); await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // Enter skips the wait
  await page.waitForFunction(() => /Question 5 of 5/.test(document.querySelector("#qnum").textContent), null, { timeout: 1000 });
  it = await current(page);
  await page.keyboard.type(misspell(it.word)); await page.keyboard.press("Enter");
  missedWords.push(it.word);
  await page.keyboard.type(it.word); await page.keyboard.press("Enter");

  // Score uses first answers only: 2 / 5.
  await page.waitForSelector("#roundEndArea:not(.hidden)");
  assert.match(await page.textContent("#roundEndArea"), /2 \/ 5 · 40%/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "btnRetest");

  // Enter starts the retest, which contains exactly the 3 missed words.
  const n0 = (await spoken(page)).length;
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#qnum"), /Retest word 1 of 3/);
  s = await sess(page);
  const retestWords = s.rounds[1].queue.map((i) => s.items[i].word).sort();
  assert.deepEqual(retestWords, missedWords.slice().sort());
  for (let i = 0; i < 3; i++) {
    await waitSpoken(page, n0 + 2 * (i + 1));
    const w = (await current(page)).word;
    if (i === 0) { await page.keyboard.type(misspell(w)); await page.keyboard.press("Enter"); await page.keyboard.type(w); await page.keyboard.press("Enter"); }
    else { await page.keyboard.type(w); await page.keyboard.press("Enter"); }
    if (i < 2) await page.waitForFunction((n) => document.querySelector("#qnum").textContent.includes(`Retest word ${n} of 3`), i + 2);
  }
  await page.waitForSelector("#roundEndArea:not(.hidden)");
  assert.match(await page.textContent("#roundEndArea"), /Retest result.*2 \/ 3/s);
  await page.click("#btnFinish");

  // Results screen: main score unchanged, retest separate, each word with first answer.
  assert.ok(await page.isVisible("#screen-results"));
  const res = await page.innerText("#resultsBody");
  assert.match(res, /2 \/ 5 correct · 40%/);
  assert.match(res, /Missed-word retest: 2 \/ 3/);
  assert.ok(res.includes(wrong));
  const rows = await page.$$eval("#resultsBody .tablewrap", (t) => t[0].querySelectorAll("tbody tr").length);
  assert.equal(rows, 5);
  const d = await page.evaluate(() => window.__ielts.data);
  assert.equal(d.history.length, 1); assert.equal(d.history[0].initial.correct, 2); assert.equal(d.history[0].retests[0].total, 3);
  assert.deepEqual(Object.values(d.missed).map((m) => m.word).sort(), missedWords.slice().sort());
  assert.equal(d.active, null);
  await ctx.close();
});

await test("progress survives closing and reopening the browser, and moving the HTML file to another folder", async () => {
  const profile = path.join(tmp, "profile");
  let ctx = await chromium.launchPersistentContext(profile, { headless: true });
  let page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "listening", 5);
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  const w = (await current(page)).word;
  await page.keyboard.type(misspell(w)); await page.keyboard.press("Enter");
  await page.keyboard.type(w); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Question 2 of 5/.test(document.querySelector("#qnum").textContent));
  await page.click("#btnEnd"); // dialog auto-accepted → saved as ended early
  await ctx.close();

  ctx = await chromium.launchPersistentContext(profile, { headless: true });
  page = await openApp(ctx);
  await page.click("#tab-progress");
  const prog = await page.innerText("#screen-progress");
  assert.match(prog, /Sessions\s*1/); assert.match(prog, /ended early/);
  await page.click("#missedDetails summary");
  assert.ok((await page.innerText("#missedTable")).includes(w));
  // Same browser profile, app copied to a different folder: data is still there.
  const moved = path.join(tmp, "moved folder", "IELTS-Spelling-Dictation.html");
  fs.mkdirSync(path.dirname(moved), { recursive: true }); fs.copyFileSync(APP, moved);
  const page2 = await openApp(ctx, {}, moved);
  assert.equal(await page2.evaluate(() => window.__ielts.data.history.length), 1);
  assert.match(await page2.textContent("#missedCount"), /1 word/);
  await ctx.close();
});

await test("an unfinished session can be resumed at the same question after closing the page", async () => {
  const ctx = await browser.newContext();
  let page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "task1", 5);
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  let w = (await current(page)).word;
  await page.keyboard.type(w); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Question 2 of 5/.test(document.querySelector("#qnum").textContent));
  const q2 = (await current(page)).word;
  await page.keyboard.type("draft");
  await page.close();
  page = await openApp(ctx);
  await page.waitForSelector("#resumeBanner:not(.hidden)");
  assert.match(await page.textContent("#resumeText"), /Question 2 of 5/);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await page.click("#btnResumeSaved");
  assert.match(await page.textContent("#qnum"), /Question 2 of 5/);
  assert.equal((await current(page)).word, q2);
  assert.equal(await page.inputValue("#answer"), "draft");
  await waitSpoken(page, 1);
  assert.equal((await spoken(page))[0].text, q2);
  await ctx.close();
});

await test("default session is 10 mixed words, prioritising missed + personal words, no repeats", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  assert.equal(await page.inputValue("#length"), "10");
  assert.ok(await page.isChecked("input[name=mode][value=mixed]"));
  // Seed two missed words from other categories, then check composition over many draws.
  await page.evaluate(() => {
    const d = window.__ielts.data;
    d.missed["b-receipt"] = { id: "b-receipt", word: "receipt", cat: "listening", misses: 1, streak: 0, lastMissed: 1 };
    d.missed["b-fluctuate"] = { id: "b-fluctuate", word: "fluctuate", cat: "task1", misses: 1, streak: 0, lastMissed: 1 };
  });
  const r = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 200; k++) {
      const it = window.__ielts.buildItems("mixed", 10);
      const ids = it.map((x) => x.id);
      out.push({ n: it.length, uniq: new Set(ids).size, prio: it.filter((x) => x.cat === "personal" || ["b-receipt", "b-fluctuate"].includes(x.id)).length,
        missed: ids.includes("b-receipt") && ids.includes("b-fluctuate"), cats: new Set(it.map((x) => x.cat)).size, first: ids[0], catList: it.map((x) => x.cat) });
    }
    return out;
  });
  assert.ok(r.every((x) => x.n === 10 && x.uniq === 10), "wrong length or repeated word");
  assert.ok(r.every((x) => x.missed), "missed words not prioritised");
  assert.ok(r.every((x) => x.prio === 6), "priority share is not 6/10");
  assert.ok(r.every((x) => x.cats >= 5), "other categories not included"); // 4 free slots shared by 5 other categories
  assert.ok(new Set(r.map((x) => x.first)).size > 20, "order not randomised");
  assert.equal(new Set(r.flatMap((x) => x.catList)).size, 6, "some category never appears in mixed sessions");
  await page.click("#btnStart");
  await waitSpoken(page, 1);
  assert.match(await page.textContent("#qnum"), /Question 1 of 10/);
  await ctx.close();
});

await test("automatic advance can be turned off; Enter then moves on", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "task2", 5);
  await page.uncheck("#autoAdvance");
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  await page.keyboard.type((await current(page)).word); await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  assert.match(await page.textContent("#qnum"), /Question 1 of 5/);
  assert.match(await page.textContent("#feedback"), /Press Enter or click Next word/);
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#qnum"), /Question 2 of 5/);
  await ctx.close();
});

await test("sound-alike words get a spoken meaning after the two readings", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await page.evaluate(() => { const d = window.__ielts.data; d.missed["b-principle"] = { id: "b-principle", word: "principle", cat: "personal", context: "principle, as in, a basic rule or belief", misses: 1, streak: 0 }; });
  await setMode(page, "missed", 5);
  await page.click("#btnStart");
  await waitSpoken(page, 3);
  const t = (await spoken(page)).map((x) => x.text);
  assert.deepEqual(t.slice(0, 3), ["principle", "principle", "principle, as in, a basic rule or belief"]);
  await ctx.close();
});

await test("no voices (real headless Chromium, no speech engine): clear error, Start disabled, nothing shown instead", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(APP).href);
  await page.waitForFunction(() => /No English voice/.test(document.querySelector("#voiceStatus").textContent), null, { timeout: 6000 });
  const st = await page.textContent("#voiceStatus");
  assert.match(st, /Manage voices/); assert.match(st, /English \(United States\)/);
  assert.equal(await page.isDisabled("#btnStart"), true);
  await ctx.close();
});

await test("no voice ever starts speaking (even after switching to a local voice): a useful error appears during dictation, word not revealed", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx, { noStart: true });
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "personal", 5);
  await page.click("#btnStart");
  // The online voice fails first, the app switches to a local voice, which also fails: then the error is shown.
  await page.waitForFunction(() => /didn't start speaking/.test(document.querySelector("#audioError").textContent), null, { timeout: 16000 });
  const w = (await current(page)).word;
  assert.ok(!(await page.innerText("#dictation")).toLowerCase().includes(w.toLowerCase()));
  await ctx.close();
});

await test("vocabulary screen: browse by category and subcategory, add, edit, delete with undo, import", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.click("#tab-vocab");
  assert.ok(!(await page.isVisible("#vocabPanel")), "word list visible before choosing a category");
  const cards = await page.innerText("#vocabCats");
  for (const c of ["Personal spelling priorities", "Listening vocabulary", "378 High Frequency", "Reading", "Academic Writing", "My own words"]) assert.ok(cards.includes(c), "missing card " + c);
  // Listening › Dates
  await page.click('[data-node="listening"]');
  assert.match(await page.textContent("#vocabTitle"), /Listening vocabulary/);
  await page.click('#vocabSubs button:has-text("Dates")');
  const dates = await page.$$eval("#vocabTable tbody tr", (r) => r.map((x) => x.querySelector("b").textContent));
  assert.deepEqual(dates.sort(), ["February", "January", "Thursday", "Tuesday", "Wednesday"]);
  // Add a word straight into Listening › Dates (the Add window opens there)
  await page.click("#btnAddOpen");
  assert.ok(await page.isVisible("#wordDialog"));
  assert.equal(await page.inputValue("#addCat"), "listening");
  assert.equal(await page.inputValue("#addSub"), "Dates");
  await page.fill("#addWord", "Saturday");
  await page.fill("#addHint", "Sat-ur-day");
  await page.click("#btnAdd");
  assert.match(await page.textContent("#addMsg"), /Added “Saturday” to Listening vocabulary › Dates/);
  assert.ok((await page.innerText("#vocabTable")).includes("Saturday"));
  await page.fill("#addWord", "january"); await page.keyboard.press("Enter");
  assert.match(await page.textContent("#addMsg"), /already in Listening vocabulary/);
  await page.click("#btnAddClose");
  assert.ok(!(await page.isVisible("#wordDialog")));
  // the empty boxes were filled in from the built-in dictionary
  await page.waitForFunction(() => { const x = window.__ielts.data.vocab.find((y) => y.word === "Saturday"); return x && x.meaning && x.ipa && x.sentence; });
  const sat = await page.evaluate(() => window.__ielts.data.vocab.find((y) => y.word === "Saturday"));
  assert.equal(sat.ipa, "/ˈsætɚdi/"); assert.match(sat.meaning, /^the seventh and last day of the week/); assert.equal(sat.pos, "noun");
  assert.equal(sat.hint, "Sat-ur-day", "what the person typed is kept");
  // Delete with undo
  await page.click('button[aria-label="Delete Saturday"]');
  assert.ok(!(await page.innerText("#vocabTable")).includes("Saturday"));
  assert.match(await page.textContent("#undoBar"), /Deleted “Saturday”/);
  await page.click("#btnUndo");
  assert.ok((await page.innerText("#vocabTable")).includes("Saturday"), "undo did not restore the word");
  await page.click('button[aria-label="Delete Saturday"]');
  // Writing: add to Task 2
  await page.click('[data-node="writing"]');
  assert.match(await page.innerText("#vocabSubs"), /Academic Writing Task 1 \(20\)[\s\S]*Academic Writing Task 2 \(20\)/);
  await page.click("#btnAddOpen");
  await page.selectOption("#addCat", "task2");
  assert.ok(await page.isDisabled("#addSub"));
  await page.fill("#addWord", "globalization"); await page.click("#btnAdd");
  await page.click("#btnAddX");
  // Reading topics
  await page.click('[data-node="reading"]');
  assert.match(await page.innerText("#vocabSubs"), /Science & Research \(13\)/);
  // My own words: new list with a new subcategory
  await page.click('[data-node="custom"]');
  assert.ok(await page.isVisible("#wordDialog"), "add window should open for an empty list");
  assert.equal(await page.inputValue("#addCat"), "custom");
  await page.fill("#addWord", "meteorology"); await page.fill("#addSub", "Weather words"); await page.click("#btnAdd");
  await page.click("#btnAddClose");
  assert.match(await page.innerText("#vocabSubs"), /Weather words \(1\)/);
  // Edit (opens the same window with the word's details)
  await page.click('button[aria-label="Edit meteorology"]');
  assert.match(await page.textContent("#addTitle"), /Edit “meteorology”/);
  assert.equal(await page.inputValue("#addSub"), "Weather words");
  await page.fill("#addWord", "meteorologist");
  await page.click("#btnAdd");
  await page.waitForSelector("#wordDialog", { state: "hidden" });
  assert.ok((await page.innerText("#vocabTable")).includes("meteorologist"));
  await page.waitForFunction(() => window.__ielts.data.vocab.find((y) => y.word === "meteorologist").ipa === "/ˌmitiɚˈɑlədʒɪst/");
  // Import CSV and TXT (in the Import section)
  await page.click("text=Import, export or restore words");
  const csv = path.join(tmp, "words.csv");
  fs.writeFileSync(csv, 'word,category,group,hint,example\nmeticulous,Personal,,"ends in ous",\naccommodation,listening,,,\n"remain stable",task1,,,\nb@d,listening,,,\nhypothesis,Writing Task 2,Science,,"test the hypothesis"\nphotosynthesis,Reading,Science & Research,,\n');
  await page.setInputFiles("#vocabFile", csv);
  await page.waitForFunction(() => /Added 2 words/.test(document.querySelector("#vocabMsg").textContent));
  assert.match(await page.textContent("#vocabMsg"), /Skipped 3 duplicates/); // accommodation, remain stable, hypothesis (now a Reading word)
  assert.match(await page.textContent("#vocabMsg"), /Skipped 1 invalid entry.*b@d/);
  const txt = path.join(tmp, "words.txt");
  fs.writeFileSync(txt, "photosynthesis\nwell-being\nmeteorologist\n");
  await page.setInputFiles("#vocabFile", txt);
  await page.waitForFunction(() => /Added 1 word\./.test(document.querySelector("#vocabMsg").textContent));
  const v = await page.evaluate(() => window.__ielts.poolFor("mixed"));
  assert.equal(v.length, 547 + 1 + 1 + 2 + 1); // globalization, meteorologist, meticulous+photosynthesis, well-being
  assert.equal(v.find((x) => x.word === "meticulous").cat, "personal");
  assert.equal(v.find((x) => x.word === "photosynthesis").cat, "reading");
  assert.equal(v.find((x) => x.word === "globalization").cat, "task2");
  await page.reload();
  const after = await page.evaluate(() => window.__ielts.poolFor("custom"));
  assert.ok(after.some((x) => x.word === "meteorologist" && x.group === "Weather words"), "edit not saved");
  // Leaving the tab hides the word list again
  await page.click("#tab-vocab"); await page.click('[data-node="personal"]');
  await page.click("#tab-practice"); await page.click("#tab-vocab");
  assert.ok(!(await page.isVisible("#vocabPanel")));
  await ctx.close();
});

await test("practice by part: Listening › Dates, Reading › a topic, Writing all and Task 2 only", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  assert.ok(!(await page.isVisible("#subRow")), "Part menu shown for Mixed");
  await page.check("input[name=mode][value=listening]");
  assert.ok(await page.isVisible("#subRow"));
  const opts = await page.$$eval("#sub option", (o) => o.map((x) => x.textContent));
  assert.match(opts[0], /All of Listening vocabulary \(25\)/);
  assert.ok(opts.includes("Dates (5)") && opts.includes("Bookings (4)"), opts.join("|"));
  await setMode(page, "listening", "all", "Dates");
  assert.match(await page.textContent("#poolInfo"), /^5 words/);
  await page.click("#btnStart");
  await waitSpoken(page, 1);
  let s = await sess(page);
  assert.equal(s.items.length, 5);
  assert.ok(s.items.every((x) => x.group === "Dates"));
  await page.click("#btnEnd");
  await setMode(page, "reading", 5, "Health & Medicine");
  await page.click("#btnStart"); await waitSpoken(page, 3);
  s = await sess(page);
  assert.ok(s.items.every((x) => x.cat === "reading" && x.group === "Health & Medicine"));
  assert.match(await page.textContent("#qcat"), /^Reading$/);
  await page.click("#btnEnd");
  await setMode(page, "writing", "all", "");
  assert.match(await page.textContent("#poolInfo"), /^40 words/);
  await setMode(page, "writing", "all", "task2");
  assert.match(await page.textContent("#poolInfo"), /^20 words/);
  await page.click("#btnStart"); await waitSpoken(page, 5);
  s = await sess(page);
  assert.ok(s.items.every((x) => x.cat === "task2"));
  assert.equal(s.modeLabel, "Academic Writing › Academic Writing Task 2");
  // The choice is remembered after reloading
  await page.click("#btnEnd");
  await page.reload();
  assert.ok(await page.isChecked("input[name=mode][value=writing]"));
  assert.equal(await page.inputValue("#sub"), "task2");
  await ctx.close();
});

await test("export progress to a file and import it into a fresh browser", async () => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await openApp(ctx);
  await page.evaluate(() => {
    const d = window.__ielts.data;
    d.history.push({ id: "s-x", startedAt: Date.now(), mode: "personal", planned: 2, endedEarly: false,
      initial: { kind: "initial", total: 2, correct: 1, items: [{ word: "emitted", cat: "personal", answer: "emmited", correct: false }, { word: "highly", cat: "personal", answer: "highly", correct: true }] }, retests: [] });
    d.missed["b-emitted"] = { id: "b-emitted", word: "emitted", cat: "personal", misses: 1, streak: 0, lastMissed: 5 };
  });
  await page.click("#tab-progress");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnExport")]);
  const file = path.join(tmp, "backup.json"); await dl.saveAs(file);
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(j.history.length, 1); assert.ok(j.missed["b-emitted"]);
  const ctx2 = await browser.newContext();
  const p2 = await openApp(ctx2);
  await p2.click("#tab-progress");
  await p2.setInputFiles("#importFile", file);
  await p2.waitForFunction(() => /Imported/.test(document.querySelector("#progressMsg").textContent));
  assert.match(await p2.innerText("#historyTable"), /1\/2 \(50%\)/);
  await p2.reload();
  assert.equal(await p2.evaluate(() => window.__ielts.data.history.length), 1);
  await ctx.close(); await ctx2.close();
});

await test("missed word clears after two later first-try successes", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await page.evaluate(() => { window.__ielts.data.missed["b-luggage"] = { id: "b-luggage", word: "luggage", cat: "listening", misses: 1, streak: 0, lastMissed: 1 }; });
  for (let k = 0; k < 2; k++) {
    await setMode(page, "missed", 5);
    await page.click("#btnStart");
    await waitSpoken(page, 2 + k * 2);
    await page.keyboard.type("luggage"); await page.keyboard.press("Enter");
    await page.waitForSelector("#roundEndArea:not(.hidden)");
    await page.click("#btnFinish");
    await page.click("#tab-practice");
  }
  assert.equal(await page.evaluate(() => Object.keys(window.__ielts.data.missed).length), 0);
  await ctx.close();
});


await test("Submit button works with the mouse alone: answer, correction and next word", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "hf", 5);
  await page.uncheck("#autoAdvance");
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  assert.match(await page.textContent("#qcat"), /378 High Frequency Words in IELTS Listening/);
  assert.equal(await page.textContent("#btnSubmit"), "Submit ⏎");
  const w = (await current(page)).word;
  await page.click("#btnSubmit"); // empty: nothing happens
  assert.match(await page.textContent("#qnum"), /Question 1 of 5/);
  await page.fill("#answer", misspell(w));
  await page.click("#btnSubmit");
  assert.match(await page.textContent("#feedback"), /Not quite/);
  assert.equal(await page.textContent("#btnSubmit"), "Submit correction ⏎");
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer", "Submit took focus away from the answer box");
  await page.fill("#answer", w);
  await page.click("#btnSubmit");
  assert.match(await page.textContent("#feedback"), /corrected/);
  assert.equal(await page.textContent("#btnSubmit"), "Next word ⏎");
  await page.click("#btnSubmit");
  assert.match(await page.textContent("#qnum"), /Question 2 of 5/);
  assert.equal(await page.textContent("#btnSubmit"), "Submit ⏎");
  assert.equal((await sess(page)).rounds[0].results[0].correct, false);
  await ctx.close();
});

await test("someone who had already edited their word list still gets the new high-frequency words", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  // Simulate data saved by the earlier version: edited 80-word list with one word deleted, no seenBuiltin.
  await page.evaluate(() => {
    const old = window.__ielts.poolFor("mixed").filter((x) => x.cat !== "hf" && x.word !== "autumn");
    old.push({ id: "c-1", word: "meteorology", cat: "custom" });
    localStorage.setItem("ieltsDictation.data.v1", JSON.stringify({ vocab: old, history: [], missed: {}, settings: {} }));
  });
  await page.reload();
  const v = await page.evaluate(() => window.__ielts.poolFor("mixed"));
  assert.equal(v.filter((x) => x.cat === "hf").length, 369);
  assert.ok(v.some((x) => x.word === "meteorology"), "custom word lost");
  assert.ok(!v.some((x) => x.word === "autumn"), "deleted word came back");
  await page.reload();
  assert.equal(await page.evaluate(() => window.__ielts.poolFor("mixed").length), v.length, "words added twice");
  await ctx.close();
});

await test("an online voice that doesn't respond (no internet) switches to a local voice and the word is still heard", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx, { onlineFails: true });
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "personal", 5);
  await page.click("#btnStart");
  await page.waitForSelector("#audioError:not(.hidden)", { timeout: 9000 });
  assert.match(await page.textContent("#audioError"), /didn't respond.*Switched to the local voice/s);
  await waitSpoken(page, 2, 6000);
  const s = await spoken(page), w = (await current(page)).word;
  assert.ok(s.slice(0, 2).every((x) => x.text === w && /Zira|David|Mark/.test(x.voice)), JSON.stringify(s));
  await ctx.close();
});

await test("Say a sentence: speaks a sentence with the word, shows nothing before answering; word info appears after", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "hf", 5);
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  const it = await page.evaluate(() => { const s = window.__ielts.session; const r = s.rounds[0]; return s.items[r.queue[s.pos]]; });
  const n = (await spoken(page)).length;
  await page.keyboard.press("Alt+x");
  await waitSpoken(page, n + 1);
  const said = (await spoken(page))[n].text;
  assert.equal(said.replace(/résumé/g, "resume"), it.sentence.replace(/\.$/, ""));
  const vis = (await page.innerText("#dictation")).toLowerCase();
  const shown = (t) => new RegExp("(^|[^a-z])" + t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z])").test(vis);
  assert.ok(!shown(it.word) && !shown(it.meaning), "word or meaning shown before answering: " + it.word);
  await page.click("#btnSentence"); // the button works too, and focus stays in the answer box
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer");
  await page.keyboard.type(it.word); await page.keyboard.press("Enter");
  const fb = await page.innerText("#feedback");
  for (const part of [it.word, it.pos, it.meaning, it.family, "378 High Frequency Words in IELTS Listening"]) assert.ok(fb.includes(part), "feedback missing: " + part);
  assert.ok(fb.includes(it.sentence), "example sentence not shown after answering");
  // Pressing Say a sentence during feedback stops the auto-advance so the sentence isn't cut off.
  await page.waitForTimeout(300); // presses of the same button within 250 ms are ignored as key-repeat
  await page.keyboard.press("Alt+x");
  await page.waitForTimeout(5000);
  assert.match(await page.textContent("#qnum"), /Question 1 of 5/);
  assert.match(fb + await page.innerText("#feedback"), /when you're ready/);
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#qnum"), /Question 2 of 5/);
  await ctx.close();
});

await test("pronunciation fixes: resume is spoken as résumé (word and sentence); old saved words get meanings", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  // A missed word saved by the earlier version: no meaning, sentence or pronunciation fix stored.
  await page.evaluate(() => { window.__ielts.data.missed["h-resume"] = { id: "h-resume", word: "resume", cat: "hf", misses: 1, streak: 0, lastMissed: 1 }; });
  await setMode(page, "missed", 5);
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  assert.deepEqual((await spoken(page)).slice(0, 2).map((x) => x.text), ["résumé", "résumé"]);
  await page.keyboard.press("Alt+x");
  await waitSpoken(page, 3);
  assert.equal((await spoken(page))[2].text, "Send your résumé with the application form");
  await page.keyboard.type("resumee"); await page.keyboard.press("Enter");
  const fb = await page.innerText("#feedback");
  assert.match(fb, /Not quite/); assert.match(fb, /a document listing your education and work experience/); assert.match(fb, /noun/);
  await ctx.close();
});

await test("pronunciation: American IPA, syllables, letter-to-sound breakdown and silent letters after answering", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  // data checks
  const r = await page.evaluate(() => { const v = window.__ielts.poolFor("mixed"); const g = (w) => v.find((x) => x.word === w); return {
    n: v.filter((x) => x.ipa && x.syl && Array.isArray(x.parts)).length, total: v.length,
    receipt: g("receipt"), accommodation: g("accommodation"), autumn: g("autumn"), wednesday: g("Wednesday"), knowledge: g("knowledge") }; });
  assert.equal(r.n, r.total, "every built-in word should have IPA, syllables and a breakdown");
  assert.equal(r.receipt.ipa, "/rɪˈsit/");
  assert.equal(r.accommodation.ipa, "/əˌkɑməˈdeɪʃən/");
  assert.equal(r.accommodation.syl, "ac·com·mo·da·tion");
  for (const x of [r.receipt, r.accommodation, r.autumn, r.wednesday, r.knowledge]) assert.equal(x.parts.map((p) => p[0]).join(""), x.word, "breakdown must spell the word");
  const silent = (x) => x.parts.filter((p) => p[2] === "s" || p[2] === "e").map((p) => p[0].toLowerCase()).join(",");
  assert.equal(silent(r.receipt), "p"); assert.equal(silent(r.autumn), "n"); assert.equal(silent(r.wednesday), "d,e"); assert.equal(silent(r.knowledge), "k,w,e");
  assert.deepEqual(r.accommodation.parts.filter((p) => p[2] === "d").map((p) => p[0]), ["cc", "mm"]);
  // shown after answering (old saved missed words get it too)
  await page.evaluate(() => { window.__ielts.data.missed["b-receipt"] = { id: "b-receipt", word: "receipt", cat: "listening", misses: 1, streak: 0 }; });
  await setMode(page, "missed", 5);
  await page.check("#showIpaHint");
  await page.click("#btnStart");
  await waitSpoken(page, 2);
  assert.match(await page.textContent("#ipaHint"), /IPA hint: \/rɪˈsit\//);
  assert.ok(!(await page.innerText("#dictation")).toLowerCase().includes("receipt"), "word revealed before answering");
  await page.keyboard.type("reciept"); await page.keyboard.press("Enter");
  const fb = await page.innerText("#feedback");
  assert.match(fb, /\/rɪˈsit\//); assert.match(fb, /re·ceipt/); assert.match(fb, /2 syllables/);
  assert.match(fb, /Silent: p/);
  assert.equal(await page.$$eval("#feedback .chip.f-s", (e) => e.map((x) => x.querySelector("b").textContent).join()), "p");
  // Hear button speaks the word and keeps the answer box focused
  const n = (await spoken(page)).length;
  await page.click("#feedback .hearbtn");
  await waitSpoken(page, n + 1);
  assert.equal((await spoken(page))[n].text, "receipt");
  assert.equal(await page.evaluate(() => document.activeElement.id), "answer");
  await ctx.close();
});

await test("adding a word fills every gap: built-in dictionary first (offline), online only for what's missing (only the word is sent); typed text is kept", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.click("#tab-vocab"); await page.click('[data-node="personal"]'); await page.click("#btnAddOpen");
  assert.match(await page.innerText(".dlg-foot"), /Look up online\s+\(only the word is sent\)/);
  assert.match(await page.textContent(".wd-sources"), /dictionaryapi\.dev, wiktionary\.org, wikipedia\.org and datamuse\.com\. Only the word is sent/);
  const val = (id) => page.inputValue(id), tag = (f) => page.textContent(`[data-src="${f}"]`);
  const waitDone = () => page.waitForFunction(() => /^[✓⚠]/.test(document.querySelector("#wdStatus").textContent));

  // 1. a word in the built-in dictionary: every box filled without going online; what was typed is kept
  await page.fill("#addHint", "my own hint");
  await page.fill("#addMeaning", "my own meaning");
  await page.type("#addWord", "meticulous");
  await waitDone();
  assert.equal(await val("#addMeaning"), "my own meaning", "typed meaning was replaced");
  assert.equal(await val("#addHint"), "my own hint");
  assert.equal(await val("#addPos"), "adjective");
  assert.equal(await val("#addSentence"), "Almost worryingly meticulous in his business formalities.");
  assert.equal(await val("#addSyn"), "punctilious");
  assert.equal(await val("#addFamily"), "meticulosity (noun), meticulousness (noun)");
  assert.equal(await val("#addIpa"), "/məˈtɪkjələs/");
  assert.match(await tag("sentence"), /WordNet/); assert.equal(await tag("meaning"), "", "a typed box has no source label");
  assert.equal((await page.$$("#wdSummary .sumchip.miss")).length, 0, "every box should be filled");
  assert.match(await page.textContent("#wdStatus"), /All details filled in/);
  assert.ok(!ctx.__lookupLog.length, "nothing needed from the internet");
  await page.click("#btnAdd");
  const m = await page.evaluate(() => window.__ielts.data.vocab.find((y) => y.word === "meticulous"));
  assert.equal(m.meaning, "my own meaning"); assert.equal(m.hint, "my own hint"); assert.equal(m.pos, "adjective");
  assert.ok(m.parts && m.syl === "me·ti·cu·lous"); assert.equal(m.src.sentence, "WordNet");
  assert.ok(m.auto.includes("sentence") && !m.auto.includes("meaning"));

  // 2. no example in the built-in dictionary: a real sentence from a Wikipedia article (not a cut-off snippet)
  await page.type("#addWord", "youngster");
  await page.waitForFunction(() => document.querySelector("#addSentence").value.startsWith("The youngster"));
  await waitDone();
  assert.equal(await val("#addSentence"), "The youngster learned to swim at the local pool in only two weeks.");
  assert.match(await tag("sentence"), /Simple English Wikipedia/);
  assert.equal(await val("#addMeaning"), "a young person of either sex");
  assert.equal(await val("#addFamily"), "young (adjective)");
  assert.equal(await val("#addHint"), "young + ster");
  assert.equal(await val("#addSyn"), "child, kid, minor, shaver, nipper");
  for (const u of ctx.__lookupLog) assert.ok(!/own|hint|meticul/i.test(u), "unexpected data sent: " + u);
  assert.ok(ctx.__lookupLog.some((u) => /simple\.wikipedia\.org.*srsearch=youngster/.test(u)));
  assert.ok(!ctx.__lookupLog.some((u) => /titles=Youngster \(film\)/.test(u)), "an article named after the word is skipped");
  // ↻ Another example: the other article sentence, then the one made from the meaning, then back
  await page.click("#btnNextExample");
  await page.waitForFunction(() => document.querySelector("#addSentence").value.startsWith("Every youngster"));
  await page.click("#btnNextExample");
  assert.equal(await val("#addSentence"), "A youngster is a young person of either sex.");
  assert.match(await tag("sentence"), /made from the meaning/);
  await page.click("#btnNextExample");
  assert.equal(await val("#addSentence"), "The youngster learned to swim at the local pool in only two weeks.");
  await page.click("#btnAdd");
  const y = await page.evaluate(() => window.__ielts.data.vocab.find((x) => x.word === "youngster"));
  assert.equal(y.src.sentence, "Simple English Wikipedia"); assert.equal(y.lookup, "v3");

  // 3. a word only an online dictionary knows: its meaning (labels removed), example and similar words
  await page.fill("#addWord", "blorft");
  await page.waitForFunction(() => document.querySelector("#addMeaning").value);
  await waitDone();
  assert.equal(await val("#addMeaning"), "to test something online.");
  assert.equal(await val("#addSentence"), "We blorft the app every day.");
  assert.match(await tag("sentence"), /dictionaryapi\.dev/);
  assert.equal(await val("#addPos"), "verb");
  assert.equal(await val("#addSyn"), "probe, check");
  await page.fill("#addWord", "");

  // 4. a long Wiktionary quotation: just the sentence that uses the word
  await page.fill("#addWord", "flimble");
  await page.waitForFunction(() => document.querySelector("#addSentence").value);
  assert.equal(await val("#addSentence"), "The old bridge would flimble in the wind every winter.");
  assert.equal(await val("#addMeaning"), "to wobble gently.");
  await page.fill("#addWord", "");

  // 5. a misspelled word: warning, suggestions (online + offline), nothing guessed, confirm before saving
  await page.fill("#addWord", "Doubtedly");
  await page.waitForFunction(() => /Not found in any dictionary/.test(document.querySelector("#wdStatus").textContent));
  assert.match(await page.innerText("#wdPron"), /isn’t in the dictionary/);
  const sugs = await page.$$eval("#wdPron [data-suggest]", (b) => b.map((x) => x.textContent));
  assert.equal(sugs[0], "undoubtedly");
  for (const id of ["#addFamily", "#addMeaning", "#addSentence", "#addHint"]) assert.equal(await val(id), "", "nothing guessed for " + id);
  await page.click("#btnAdd");
  assert.match(await page.textContent("#addMsg"), /wasn’t found in any dictionary.*Save word.*again/);
  assert.ok(!(await page.evaluate(() => window.__ielts.data.vocab.some((y) => y.word === "Doubtedly"))), "saved without confirming");
  await page.click('#wdPron [data-suggest="undoubtedly"]');
  assert.equal(await val("#addWord"), "undoubtedly");
  await page.waitForFunction(() => document.querySelector("#addSentence").value);
  assert.match(await page.innerText("#wdPron"), /ənˈdaʊtɪdli/);
  assert.equal(await val("#addSentence"), "It's undoubtedly very beautiful.");
  assert.equal(await val("#addHint"), "un + doubt + ed + ly · silent b");
  assert.equal(await val("#addFamily"), "doubt (noun)");
  assert.ok((await page.evaluate(() => window.__ielts.Pron.similar("doubtedly"))).includes("undoubtedly"), "offline suggestions");
  await page.fill("#addWord", "");

  // 6. look-up switched off: nothing is sent, and the built-in dictionary still fills every box
  await page.uncheck("#onlineLookup");
  const before = ctx.__lookupLog.length;
  await page.type("#addWord", "psychology");
  await waitDone();
  assert.equal(await val("#addSentence"), "Psychology is the science of mental life.");
  assert.match(await tag("sentence"), /made from the meaning/);
  assert.equal(await val("#addHint"), "psy·chol·o·gy · silent p · ch sounds like k");
  assert.equal((await page.$$("#wdSummary .sumchip.miss")).length, 0);
  await page.click("#btnAdd");
  await page.waitForTimeout(800);
  assert.equal(ctx.__lookupLog.length, before, "requests were sent with look-up off");
  const ps = await page.evaluate(() => window.__ielts.data.vocab.find((y) => y.word === "psychology"));
  assert.equal(ps.meaning, "the science of mental life"); assert.equal(ps.ipa, "/saɪˈkɑlədʒi/");
  // switching look-up back on offers to find a real example for it
  await page.check("#onlineLookup");
  await page.click("#btnAddClose");
  await page.waitForFunction(() => /missing details/.test(document.querySelector("#fillBar").textContent));
  // Say a sentence uses the meaning when there's no example
  const say = await page.evaluate(() => window.__ielts.sentenceFor({ word: "zorbl", meaning: "a made-up test word" }));
  assert.equal(say, "zorbl. zorbl means: a made-up test word.");
  await page.click("#btnAddOpen"); await page.uncheck("#onlineLookup"); await page.click("#btnAddClose");
  await page.reload();
  assert.equal(await page.evaluate(() => window.__ielts.data.settings.onlineLookup), false, "setting not remembered");
  await ctx.close();
});

await test("imported and older words get every gap filled in the background; without internet the built-in dictionary still fills them and the app offers to try online later", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.click("#tab-vocab"); await page.click('[data-node="custom"]'); await page.click("#btnAddX");
  await page.click("text=Import, export or restore words");
  const txt = path.join(tmp, "fill.txt"); fs.writeFileSync(txt, "meticulous\nzorbl\nyoungster\n");
  await page.setInputFiles("#vocabFile", txt);
  await page.waitForFunction(() => { const v = window.__ielts.data.vocab, f = (w) => v.find((y) => y.word === w) || {}; return f("meticulous").meaning && f("zorbl").meaning && f("youngster").lookup === "v3"; });
  await page.waitForFunction(() => !/Filling in details/.test(document.querySelector("#fillBar").textContent));
  const v = await page.evaluate(() => window.__ielts.data.vocab.filter((y) => y.cat === "custom"));
  const met = v.find((y) => y.word === "meticulous"), zo = v.find((y) => y.word === "zorbl"), yo = v.find((y) => y.word === "youngster");
  assert.equal(met.ipa, "/məˈtɪkjələs/"); assert.equal(met.meaning, "marked by precise accordance with details"); assert.equal(met.src.meaning, "WordNet");
  assert.equal(met.hint, "me·ti·cu·lous"); assert.ok(met.auto.includes("meaning") && met.auto.includes("hint"));
  assert.equal(zo.meaning, "a made-up test word"); assert.equal(zo.pos, "noun"); assert.ok(!zo.ipa && zo.pronTried);
  assert.equal(zo.sentence, "A zorbl is a made-up test word."); assert.equal(zo.src.sentence, "made from the meaning");
  assert.equal(yo.sentence, "The youngster learned to swim at the local pool in only two weeks.");
  // a word saved by an earlier version, with an empty example, is filled in too; what was typed stays
  await page.evaluate(() => { window.__ielts.data.vocab.push({ id: "c-old", word: "resent", cat: "custom", meaning: "to feel bitter about", lookup: "v2" }); });
  await page.click("#tab-practice"); await page.click("#tab-vocab"); await page.click('[data-node="custom"]');
  assert.match(await page.textContent("#fillBar"), /missing details/);
  await page.click("#btnFillAll");
  await page.waitForFunction(() => window.__ielts.data.vocab.find((y) => y.id === "c-old").sentence);
  const old = await page.evaluate(() => window.__ielts.data.vocab.find((y) => y.id === "c-old"));
  assert.equal(old.sentence, "She resents being paid less than her co-workers."); assert.equal(old.meaning, "to feel bitter about", "typed meaning kept");
  assert.equal(old.syn, "begrudge"); assert.equal(old.hint, "re·sent · s sounds like z"); assert.equal(old.family, "resentment (noun)");
  await ctx.close();

  const ctx2 = await browser.newContext();
  const p2 = await openApp(ctx2, { lookup: "offline" });
  await p2.click("#tab-vocab"); await p2.click('[data-node="custom"]');
  await p2.fill("#addWord", "youngster");
  await p2.waitForFunction(() => /Couldn't reach the online dictionaries/.test(document.querySelector("#wdStatus").textContent));
  assert.equal(await p2.inputValue("#addIpa"), "/ˈjʌŋstɚ/");
  assert.equal(await p2.inputValue("#addMeaning"), "a young person of either sex");
  assert.equal(await p2.inputValue("#addSentence"), "A youngster is a young person of either sex.");
  await p2.click("#btnAdd"); await p2.click("#btnAddClose");
  await p2.waitForFunction(() => /couldn't be looked up online/.test(document.querySelector("#fillBar").textContent));
  const d = await p2.evaluate(() => window.__ielts.data.vocab.find((y) => y.word === "youngster"));
  assert.equal(d.meaning, "a young person of either sex"); assert.ok(!d.lookup, "should try online again later");
  await ctx2.close();
});

await test("Practice screen quick start: stats, Start and Review missed words", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnHeroStart").disabled);
  assert.match(await page.innerText("#heroStats"), /547 words/);
  assert.match(await page.textContent("#heroMode"), /Mixed.*10 words/);
  assert.ok(await page.isDisabled("#btnHeroMissed"));
  await page.click("#btnHeroStart");
  await waitSpoken(page, 1);
  assert.ok(await page.isVisible("#answer"));
  await ctx.close();
});

await test("Sounds page: sound cards with recordings, mouth diagrams, steps, examples, test your ear; silent and double letters; look-up", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled); // voice ready
  await page.evaluate(() => { window.__played = []; HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.slice(0, 30) + "|" + this.playbackRate); return Promise.resolve(); }; });
  await page.click("#tab-sounds");
  await page.waitForSelector("#soundsVowels .stile");
  assert.equal(await page.locator("#soundsVowels .stile").count(), 17);
  assert.match(await page.innerText("#sndDetail"), /Click a sound/);
  await page.click('[data-sview="consonants"]');
  assert.equal(await page.locator("#soundsConsonants .stile").count(), 24);
  assert.match(await page.innerText("#soundsConsonants"), /air[\s\S]*p[\s\S]*voice[\s\S]*b/);
  // a sound: its recording plays, with a mouth diagram, simple steps and example words
  await page.click('.stile[data-snd="sh"]');
  const det = await page.innerText("#sndDetail");
  assert.match(det, /\/ʃ\//); assert.match(det, /How to say it/); assert.match(det, /Voice off/); assert.match(det, /Don't confuse/);
  assert.equal(await page.locator("#sndDetail svg.mouth-side").count(), 1);
  assert.equal(await page.locator("#sndDetail svg.mouth-front").count(), 1);
  assert.match(await page.textContent("#sndDetail .fig-front figcaption"), /Lips rounded/);
  let played = await page.evaluate(() => window.__played);
  assert.equal(played.length, 1); assert.ok(played[0].startsWith("data:audio/ogg;base64,"), played[0]);
  assert.match(await page.innerHTML("#sndDetail .sd-ex"), /sta<b>ti<\/b>on/, "the letters that make the sound are highlighted");
  await page.click('#sndDetail button:has-text("Slowly")');
  played = await page.evaluate(() => window.__played); assert.match(played[played.length - 1], /\|0\.6$/);
  // 🎧 Test your ear
  await page.click("#btnEar");
  await page.waitForSelector("#earTest .earopt");
  assert.equal(await page.locator("#earTest .earopt").count(), 2);
  await page.click("#earTest .earopt >> nth=0");
  assert.match(await page.textContent("#earMsg"), /(Right|It was)[\s\S]*Score: \d of 1/);
  // how the sound is spelled in your words
  await page.click('#sndDetail .spchip:has-text("ti")');
  assert.match(await page.innerText("#spellWords"), /accommodation/);
  // a vowel that moves: its diagram changes while it plays
  await page.click('[data-sview="vowels"]');
  await page.click('.stile[data-snd="ay"]');
  assert.match(await page.innerText("#sndDetail"), /moves during this sound/);
  // silent and double letters
  await page.click('[data-sview="silent"]');
  assert.ok(!(await page.isVisible("#sndDetail")), "the sound panel is hidden for letter lists");
  const silent = await page.innerText("#soundsSilent");
  assert.ok(/receipt/.test(silent) && /autumn/.test(silent) && /knowledge/.test(silent));
  assert.equal((silent.match(/sometimes/g) || []).length, 1, "a word should be listed once per group");
  await page.click('[data-sview="double"]');
  assert.match(await page.innerText("#soundsDouble"), /cc[\s\S]*accommodation/);
  // look up a word; a letter group opens its sound
  await page.fill("#soundLookup", "wednesday");
  const out = await page.innerText("#soundLookupOut");
  assert.match(out, /Wednesday/); assert.match(out, /\/ˈwɛnzdi\//); assert.match(out, /Silent: d, e/);
  await page.click("#soundLookupOut .chip >> nth=0");
  assert.match(await page.innerText("#sndDetail"), /\/w\//);
  // words in the lists are read by the voice
  await page.click('[data-sview="silent"]');
  await page.click('#soundsSilent button.wordlink:has-text("receipt")');
  await waitSpoken(page, 1);
  assert.equal((await spoken(page))[0].text, "receipt");
  await ctx.close();
});

await test("every recording on the Sounds page is valid audio of a sensible length, and no sound is missing one", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  const res = await page.evaluate(async () => {
    const A = window.__ielts.soundData().audio, ac = new OfflineAudioContext(1, 24000, 24000), bad = [];
    for (const [k, b64] of Object.entries(A)) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      try { const buf = await ac.decodeAudioData(bytes.buffer); if (buf.duration < 0.15 || buf.duration > 2.5) bad.push(k + " " + buf.duration.toFixed(2) + "s"); }
      catch (e) { bad.push(k + " " + e.message); }
    }
    return { total: Object.keys(A).length, bad };
  });
  assert.deepEqual(res.bad, []);
  const missing = await page.evaluate(() => {
    const S = window.__ielts.soundData(), out = [];
    for (const x of S.sounds) for (const k of ["s:" + x.id, "w:" + x.key, ...x.ex.map((w) => "w:" + w), ...x.pairs.flat().map((w) => "w:" + w)]) if (!S.audio[k]) out.push(k);
    return out;
  });
  assert.deepEqual(missing, []);
  await ctx.close();
});

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
