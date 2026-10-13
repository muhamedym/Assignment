// Simulated Web Speech API for automated tests (injected before the app loads).
// Behaves like Chrome/Edge: voices arrive late via "voiceschanged", speak() queues,
// cancel() interrupts. Records every utterance so tests can check timing and overlap.
(() => {
  const cfg = Object.assign({ voiceDelay: 400, noVoices: false, noStart: false }, window.__mockCfg || {});
  const V = (name, lang, local) => ({ name, lang, localService: local, voiceURI: name, default: false });
  const voices = cfg.noVoices ? [] : [
    V("Microsoft Aria Online (Natural) - English (United States)", "en-US", false),
    V("Microsoft Zira - English (United States)", "en-US", true),
    V("Microsoft David - English (United States)", "en-US", true),
    V("Microsoft George - English (United Kingdom)", "en-GB", true),
    V("Microsoft Hedda - German (Germany)", "de-DE", true),
  ];
  let loaded = false;
  const listeners = new Set();
  const log = (window.__speechLog = []);
  const stats = (window.__speechStats = { maxActive: 0, queuedWhileBusy: 0, cancels: 0 });
  let current = null; const queue = [];
  function fire(u, type, extra) { const ev = Object.assign({ type, utterance: u }, extra || {}); if (typeof u["on" + type] === "function") u["on" + type](ev); }
  function next() {
    if (current || !queue.length) return;
    current = queue.shift();
    const u = current;
    if (cfg.noStart) return; // engine silently never starts
    if (cfg.onlineFails && u.voice && !u.voice.localService) return; // online voice unreachable (no internet)
    stats.maxActive = Math.max(stats.maxActive, 1);
    const dur = 120 + 12 * u.text.length / (u.rate || 1);
    u.__t = setTimeout(() => {
      log.push({ ev: "start", text: u.text, rate: u.rate, volume: u.volume, voice: u.voice && u.voice.name, t: performance.now() });
      fire(u, "start");
      u.__t = setTimeout(() => {
        log.push({ ev: "end", text: u.text, t: performance.now() });
        current = null; fire(u, "end"); next();
      }, dur);
    }, 20);
  }
  const synth = {
    get speaking() { return !!current; }, get pending() { return queue.length > 0; }, paused: false,
    getVoices() { return loaded ? voices.slice() : []; },
    speak(u) { if (current || queue.length) stats.queuedWhileBusy++; queue.push(u); next(); },
    cancel() {
      stats.cancels++;
      const all = (current ? [current] : []).concat(queue.splice(0));
      if (current) { clearTimeout(current.__t); log.push({ ev: "cancel", text: current.text, t: performance.now() }); }
      current = null;
      for (const u of all) fire(u, "error", { error: "interrupted" });
    },
    pause() {}, resume() {},
    addEventListener(t, f) { if (t === "voiceschanged") listeners.add(f); },
    removeEventListener(t, f) { listeners.delete(f); },
    onvoiceschanged: null,
  };
  setTimeout(() => { loaded = true; listeners.forEach((f) => f({})); if (synth.onvoiceschanged) synth.onvoiceschanged({}); }, cfg.voiceDelay);
  class Utt { constructor(text) { this.text = text; this.rate = 1; this.volume = 1; this.pitch = 1; this.voice = null; this.lang = ""; } }
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
})();
