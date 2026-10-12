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
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n      ")); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ielts-e2e-"));

async function openApp(ctx, cfg = {}, file = APP) {
  const page = await ctx.newPage();
  await page.addInitScript(`window.__mockCfg = ${JSON.stringify(cfg)};\n${MOCK}`);
  page.on("pageerror", (e) => { throw new Error("Page error: " + e.message); });
  page.on("dialog", (d) => d.accept());
  await page.goto(pathToFileURL(file).href);
  return page;
}
const spoken = (page) => page.evaluate(() => window.__speechLog.filter((x) => x.ev === "start"));
async function waitSpoken(page, n, timeout = 8000) {
  await page.waitForFunction((n) => window.__speechLog.filter((x) => x.ev === "start").length >= n, n, { timeout });
}
const sess = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__ielts.session)));
const current = (page) => page.evaluate(() => { const s = window.__ielts.session; const r = s.rounds[s.rounds.length - 1]; return s.items[r.queue[s.pos]]; });
// Always a letter substitution, so both "wrong" and "fix" highlights must appear.
const misspell = (w) => w[0] + (w[1].toLowerCase() === "q" ? "z" : "q") + w.slice(2);

async function setMode(page, mode, length) {
  await page.check(`input[name=mode][value=${mode}]`);
  await page.selectOption("#length", String(length));
}

const browser = await chromium.launch({ headless: true });
console.log("IELTS Spelling Dictation — end-to-end tests\n");

await test("vocabulary: 80 document words + 369 high-frequency listening words from the 4 tables, no earlier misspellings, no duplicates", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  const v = await page.evaluate(() => window.__ielts.poolFor("mixed"));
  assert.equal(v.length, 449);
  const counts = {}; for (const x of v) counts[x.cat] = (counts[x.cat] || 0) + 1;
  assert.deepEqual(counts, { personal: 15, listening: 25, task1: 20, task2: 20, hf: 369 });
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

await test("voices load late and a local US English voice is chosen by default; online voices are labelled", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx, { voiceDelay: 1200 });
  await page.waitForFunction(() => document.querySelector("#voiceStatus").textContent.includes("Voice ready"));
  const opts = await page.$$eval("#voice option", (o) => o.map((x) => x.textContent));
  assert.match(opts[0], /Zira|David/); assert.match(opts[0], /local, works offline/);
  assert.ok(opts.some((o) => /Aria Online.*online, needs internet/.test(o)));
  assert.ok(opts.some((o) => /George/.test(o)) && !opts.some((o) => /Hedda/.test(o)), "non-English voice listed");
  assert.equal(await page.isDisabled("#btnStart"), false);
  await page.selectOption("#voice", { label: opts.find((o) => /Aria/.test(o)) });
  assert.match(await page.textContent("#voiceStatus"), /online.*needs internet/s);
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
  const starts = log.filter((x) => x.ev === "start"), end1 = log.find((x) => x.ev === "end");
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
  await page.waitForFunction(() => /Question 2 of 5/.test(document.querySelector("#qnum").textContent), null, { timeout: 4000 });
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
  assert.ok((await spoken(page)).slice(before).every((x) => x.text === it.word));
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
        missed: ids.includes("b-receipt") && ids.includes("b-fluctuate"), cats: new Set(it.map((x) => x.cat)).size, first: ids[0] });
    }
    return out;
  });
  assert.ok(r.every((x) => x.n === 10 && x.uniq === 10), "wrong length or repeated word");
  assert.ok(r.every((x) => x.missed), "missed words not prioritised");
  assert.ok(r.every((x) => x.prio === 6), "priority share is not 6/10");
  assert.ok(r.every((x) => x.cats === 5), "other categories not included");
  assert.ok(new Set(r.map((x) => x.first)).size > 20, "order not randomised");
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
  assert.match(await page.textContent("#feedback"), /Press Enter for the next word/);
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

await test("voice that never starts speaking: a useful error appears during dictation, word not revealed", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx, { noStart: true });
  await page.waitForFunction(() => !document.querySelector("#btnStart").disabled);
  await setMode(page, "personal", 5);
  await page.click("#btnStart");
  await page.waitForSelector("#audioError:not(.hidden)", { timeout: 9000 });
  assert.match(await page.textContent("#audioError"), /didn't start speaking/);
  const w = (await current(page)).word;
  assert.ok(!(await page.innerText("#dictation")).toLowerCase().includes(w.toLowerCase()));
  await ctx.close();
});

await test("vocabulary: add, edit, CSV/TXT import with duplicates skipped, list hidden until requested", async () => {
  const ctx = await browser.newContext();
  const page = await openApp(ctx);
  await page.click("#tab-vocab");
  assert.ok(!(await page.isVisible("#vocabTable")), "list visible by default");
  await page.fill("#addWord", "  meteorology ");
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#vocabMsg"), /Added “meteorology”/);
  const csv = path.join(tmp, "words.csv");
  fs.writeFileSync(csv, 'word,category,group,hint,example\nmeticulous,Personal,,"ends in ous",\naccommodation,listening,,,\n"remain stable",task1,,,\nb@d,listening,,,\nhypothesis,Writing Task 2,Science,,"test the hypothesis"\n');
  await page.setInputFiles("#vocabFile", csv);
  await page.waitForFunction(() => /Added 2 words/.test(document.querySelector("#vocabMsg").textContent));
  assert.match(await page.textContent("#vocabMsg"), /Skipped 2 duplicates/);
  assert.match(await page.textContent("#vocabMsg"), /Skipped 1 invalid entry.*b@d/);
  const txt = path.join(tmp, "words.txt");
  fs.writeFileSync(txt, "photosynthesis\nwell-being\nmeteorology\n");
  await page.setInputFiles("#vocabFile", txt);
  await page.waitForFunction(() => /Added 2 words/.test(document.querySelector("#vocabMsg").textContent));
  const v = await page.evaluate(() => window.__ielts.poolFor("mixed"));
  assert.equal(v.length, 454);
  assert.equal(v.find((x) => x.word === "meticulous").cat, "personal");
  assert.equal(v.find((x) => x.word === "meticulous").hint, "ends in ous");
  assert.equal(v.find((x) => x.word === "hypothesis").cat, "task2");
  assert.equal(v.find((x) => x.word === "photosynthesis").cat, "custom");
  await page.click("#btnShowVocab");
  await page.selectOption("#vocabFilter", "custom");
  await page.click('button[aria-label="Edit meteorology"]');
  await page.fill("#edWord", "meteorologist");
  await page.click("button[data-save]");
  assert.ok((await page.innerText("#vocabTable")).includes("meteorologist"));
  await page.reload();
  assert.ok((await page.evaluate(() => window.__ielts.poolFor("custom"))).some((x) => x.word === "meteorologist"), "edit not saved");
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

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
