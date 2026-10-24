"""Record the audio for the Sounds page with the Kokoro-82M voice model (Apache-2.0).

Makes dev/sounds-audio.json: every sound on its own (e.g. a held "sss", a short "puh"), its key word,
example words and the word pairs used in "Don't confuse" / "Test your ear", as small Ogg Opus clips.
build.py puts them into the app, so the Sounds page plays real recordings, also offline.

How each recording is made:
  * Words are said inside the phrase "Listen. <word>." (a sentence on its own gives a clear, careful
    pronunciation) and cut out using the model's own timing for every sound.
  * Single sounds are cut from a short word or syllable (see dev/sounds_content.py): vowels and
    consonants you can hold are lengthened a little; stops get a short "uh" (puh, buh), as teachers say them.
  * With --verify, every word is checked with the Whisper speech recognizer: it must pick the right word
    from a list of real words that differ by one sound (ship: sheep, shop, chip…). A word that fails is
    re-recorded at another speed; words that never pass are reported.

Needs (developer machine only; nothing here ships with the app):
  npm pack kokoro-q8-shards kokoro-js     # the model (6 parts) and the voices
  pip install onnxruntime onnx numpy scipy soundfile ; ffmpeg on the PATH
  python dev/build_sounds.py --model-dir <folder with the two unpacked npm packages> [--verify]
"""
import argparse
import base64
import gzip
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sounds_content import SOUNDS  # noqa: E402

SR = 24000
FRAME = 600          # samples per model frame (25 ms)
VOICE = "af_heart"   # American English, female
CARRIER = "lˈɪsən. {}."
# The sound comes out about 80 ms before the model's own timing for it (measured on 60 recordings),
# so timings are moved earlier by this much, and every cut is then checked against the sound itself.
LEAD = int(0.08 * SR)

# Kokoro's phoneme symbols (from the model's config.json)
VOCAB = {";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6, "—": 9, "…": 10, "\"": 11, "(": 12, ")": 13, "“": 14, "”": 15, " ": 16,
         "A": 24, "I": 25, "O": 31, "W": 39, "Y": 41, "ᵊ": 42, "a": 43, "b": 44, "d": 46, "e": 47, "f": 48, "h": 50, "i": 51, "j": 52,
         "k": 53, "l": 54, "m": 55, "n": 56, "o": 57, "p": 58, "s": 61, "t": 62, "u": 63, "v": 64, "w": 65, "z": 68, "ɑ": 69,
         "æ": 72, "ɔ": 76, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85, "ɛ": 86, "ɜ": 87, "ɡ": 92, "ɪ": 102, "ŋ": 112, "θ": 119, "ɹ": 123,
         "ɾ": 125, "ʃ": 131, "ʧ": 133, "ʊ": 135, "ʌ": 138, "ʒ": 147, "ʔ": 148, "ˈ": 156, "ˌ": 157, "ː": 158}

# CMU (ARPAbet) -> Kokoro (misaki, American English)
ARPA = {"AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "W", "AY": "I", "EH": "ɛ", "EY": "A", "IH": "ɪ", "IY": "i", "OW": "O", "OY": "Y",
        "UH": "ʊ", "UW": "u", "B": "b", "CH": "ʧ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "ʤ", "K": "k", "L": "l",
        "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "ɹ", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j",
        "Z": "z", "ZH": "ʒ"}
VOWELS = set("AIOWYɑæɔɛɪiʊuʌəɜ")


def load_cmu():
    d = {}
    with gzip.open(os.path.join(HERE, "cmudict-full.txt.gz"), "rt", encoding="utf-8") as f:
        for line in f:
            if line and not line.startswith(";"):
                w, *p = line.split()
                d[w] = p
    return d


def to_misaki(arpa):
    out = []
    for ph in arpa:
        base, stress = re.match(r"([A-Z]+)(\d?)", ph).groups()
        if base == "AH":
            v = "ə" if stress == "0" else "ʌ"
        elif base == "ER":
            v = "əɹ" if stress == "0" else "ɜɹ"
        else:
            v = ARPA[base]
        mark = {"1": "ˈ", "2": "ˌ"}.get(stress, "")
        out.append(mark + v)
    return "".join(out)


class Kokoro:
    def __init__(self, model_dir):
        import onnx
        import onnxruntime as ort
        shards = os.path.join(model_dir, "kokoro-q8-shards", "package")
        model = os.path.join(model_dir, "kokoro-q8-dur.onnx")
        if not os.path.exists(model):
            raw = b"".join(open(os.path.join(shards, f"kokoro-q8.part{i}.bin"), "rb").read() for i in range(6))
            m = onnx.load_from_string(raw)
            # also return the model's own length (in frames) for every phoneme, to cut words exactly
            m.graph.output.append(onnx.helper.make_tensor_value_info("/encoder/Round_output_0", onnx.TensorProto.FLOAT, None))
            onnx.save(m, model)
        self.sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
        self.voice = np.fromfile(os.path.join(model_dir, "kokoro-js", "package", "voices", VOICE + ".bin"), dtype=np.float32).reshape(-1, 256)

    def say(self, phonemes, speed=1.0):
        toks = [VOCAB[c] for c in phonemes]
        style = self.voice[min(len(toks), len(self.voice)) - 1][None, :]
        wav, dur = self.sess.run(None, {"input_ids": np.array([[0, *toks, 0]], dtype=np.int64), "style": style,
                                        "speed": np.array([speed], dtype=np.float32)})
        return wav.ravel(), dur.ravel().astype(int)   # dur: frames for <pad>, each phoneme, <pad>


# ---------------- small signal tools ----------------
def frame_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)


def voiced(x):
    x = x - x.mean()
    if np.sqrt(np.mean(x ** 2)) < 1e-4:
        return False
    ac = np.correlate(x, x, "full")[len(x) - 1:]
    ac = ac / (ac[0] + 1e-12)
    lo, hi = SR // 450, SR // 70
    return ac[lo:hi].max() > 0.45


def pitch_period(x):
    x = x - x.mean()
    ac = np.correlate(x, x, "full")[len(x) - 1:]
    lo, hi = SR // 450, SR // 70
    return lo + int(np.argmax(ac[lo:hi]))


def fade(x, a=0.012, b=0.03):
    x = x.copy()
    na, nb = min(len(x) // 3, int(a * SR)), min(len(x) // 3, int(b * SR))
    if na: x[:na] *= np.linspace(0, 1, na) ** 2
    if nb: x[-nb:] *= np.linspace(1, 0, nb) ** 2
    return x


def xfade_append(a, b, n):
    n = min(n, len(a), len(b))
    if n <= 0:
        return np.concatenate([a, b])
    w = np.linspace(0, 1, n)
    return np.concatenate([a[:-n], a[-n:] * (1 - w) + b[:n] * w, b[n:]])


def pitch_marks(seg):
    """One mark per vocal-fold cycle (the biggest peak in each period)."""
    P = pitch_period(seg[len(seg) // 4: 3 * len(seg) // 4])
    marks, i = [], int(np.argmax(np.abs(seg[:P]))) if len(seg) > P else 0
    while i < len(seg):
        lo, hi = max(0, i - P // 4), min(len(seg), i + P // 4 + 1)
        j = lo + int(np.argmax(seg[lo:hi])) if hi > lo else i
        marks.append(j)
        i = j + P
    return np.array(marks), P


def extend_voiced(seg, target):
    """Make a voiced sound last longer without changing its pitch (TD-PSOLA): the output is built from
    two-period pieces of the original, taken more slowly, one per vocal-fold cycle."""
    n_out = int(target * SR)
    if len(seg) >= n_out or len(seg) < int(0.05 * SR):
        return seg
    marks, P = pitch_marks(seg)
    if len(marks) < 3:
        return seg
    # keep the natural start and end; stretch the middle
    keep = int(0.04 * SR)
    head_end, tail_start = keep, len(seg) - keep
    mid_marks = marks[(marks > head_end) & (marks < tail_start)]
    if len(mid_marks) < 2:
        mid_marks = marks
    out = np.zeros(n_out + 4 * P)
    norm = np.zeros_like(out)
    win = np.hanning(2 * P + 1)
    # output grain positions: one per period
    t_out = np.arange(P, n_out, P)
    for k, t in enumerate(t_out):
        frac = k / max(1, len(t_out) - 1)
        m = int(mid_marks[min(len(mid_marks) - 1, int(frac * (len(mid_marks) - 1) + 0.5))]) if t < n_out - keep else None
        if t < keep:
            m = int(marks[min(len(marks) - 1, np.searchsorted(marks, t))])
        elif t >= n_out - keep:
            m = int(marks[min(len(marks) - 1, np.searchsorted(marks, t - (n_out - len(seg))))])
        lo, hi = m - P, m + P + 1
        if lo < 0 or hi > len(seg):
            continue
        out[t - P:t + P + 1] += seg[lo:hi] * win
        norm[t - P:t + P + 1] += win
    norm[norm < 1e-3] = 1
    y = (out / norm)[:n_out]
    rms_in = np.sqrt(np.mean(seg ** 2))
    return y * (rms_in / (np.sqrt(np.mean(y ** 2)) + 1e-9))


def extend_noise(seg, target, seed=1):
    """Make a hiss last longer by overlapping many short random pieces of it."""
    body = seg[int(0.15 * len(seg)): int(0.85 * len(seg))]
    g = int(0.02 * SR)
    if len(body) <= g + 1:
        body = seg
    if len(body) <= g + 1:
        return seg
    rng = np.random.default_rng(seed)
    n = int(target * SR)
    out = np.zeros(n + g)
    win = np.hanning(g)
    for pos in range(0, n, g // 4):
        s = rng.integers(0, len(body) - g)
        out[pos:pos + g] += body[s:s + g] * win
    out = out[:n]
    rms_in, rms_out = np.sqrt(np.mean(body ** 2)), np.sqrt(np.mean(out ** 2)) + 1e-9
    return out * (rms_in / rms_out)


def normalize(x, rms_db=-20.0, peak=0.89):
    act = x[np.abs(x) > np.abs(x).max() * 0.05] if np.abs(x).max() > 0 else x
    g = 10 ** (rms_db / 20) / (np.sqrt(np.mean(act ** 2)) + 1e-9)
    y = x * g
    if np.abs(y).max() > peak:
        y *= peak / np.abs(y).max()
    return y.astype(np.float32)


# ---------------- recording ----------------
def phoneme_spans(ph, dur):
    """Sample range of every phoneme character of the input."""
    spans, pos = [], dur[0] * FRAME
    for c, d in zip(ph, dur[1:-1]):
        spans.append((c, pos, pos + d * FRAME))
        pos += d * FRAME
    return spans


def record_word(k, word_ph, speed):
    """Say 'Listen. <word>.' and cut out the word. Returns (word audio, timings of its phonemes, whole phrase)."""
    text = CARRIER.format(word_ph)
    wav, dur = k.say(text, speed)
    spans = [(c, max(0, s - LEAD), max(0, e - LEAD)) for c, s, e in phoneme_spans(text, dur)]
    start_i = text.index(word_ph, len("lˈɪsən. ") - 1)
    w_spans = spans[start_i:start_i + len(word_ph)]
    # cut at the quietest moment between "Listen." and the word (some sounds, like s, start early)
    look_from = max(0, spans[start_i - 2][1])
    look_to = w_spans[0][1] + FRAME
    env = np.sqrt(np.convolve(wav ** 2, np.ones(240) / 240, "same"))
    seg_from = look_from + int(np.argmin(env[look_from:look_to]))
    end = spans[start_i + len(word_ph)][2] + LEAD   # include the final "." (release, fade)
    a = wav[seg_from:end]
    # trim the silence at both ends, keep 20 ms before and 60 ms after
    env = np.convolve(np.abs(a), np.ones(240) / 240, "same")
    idx = np.where(env > env.max() * 0.01)[0]
    if len(idx):
        first = max(0, idx[0] - int(0.02 * SR))
        a = a[first:min(len(a), idx[-1] + int(0.06 * SR))]
        seg_from += first
    shifted = [(c, max(0, s - seg_from), max(0, e - seg_from)) for c, s, e in w_spans]
    return fade(a, 0.008, 0.04), shifted, wav


def take_sound(k, item, speed=0.8):
    """The sound on its own, cut from its source syllable or word."""
    src, take = item["src"], item["take"]
    if take == "glide":
        speed = 0.6   # slower, so the movement of a two-part vowel is easy to hear
    if take in ("buzz", "syllable_slow"):
        speed = 0.5   # z, zh, v, th(is) are short and soft: say them slowly
    if take == "vowel_slow":
        speed, take = 0.55, "vowel"   # the weak "uh" is very short: say it slowly
    a, spans, _ = record_word(k, src, speed)
    sym = item["sym"]
    # which phoneme characters of the source hold the sound
    target = {"ɝ": "ɜɹ", "ɚ": "əɹ", "eɪ": "A", "oʊ": "O", "aɪ": "I", "aʊ": "W", "ɔɪ": "Y", "tʃ": "ʧ", "dʒ": "ʤ", "g": "ɡ", "r": "ɹ", "j": "j"}.get(sym, sym)
    chars = "".join(c for c, _, _ in spans)
    at = chars.find(target) if target != "ə" else chars.find("ə")
    if at < 0:
        raise ValueError(f"{sym}: {target} not in {src}")
    if at > 0 and chars[at - 1] in "ˈˌ":   # the stress mark's frames belong to the vowel
        at -= 1
        target = chars[at] + target
    s = spans[at][1]
    e = spans[at + len(target) - 1][2]
    if take in ("syllable", "syllable_slow"):
        # the consonant and the start of the vowel after it: "puh", "buh", "wuh"
        frames = [(i, frame_db(a[i:i + 240])) for i in range(max(0, s - int(0.05 * SR)), e, 120)]
        peak = max(db for _, db in frames) if frames else -60
        onset = next((i for i, db in frames if db > peak - 30), s)
        v_end = min(len(a), e + int(0.16 * SR))
        clip = a[max(0, onset - int(0.02 * SR)):v_end]
        return fade(clip, 0.004, 0.07)
    # vowels: their frames plus a little either side; a consonant at the start of the word: from the very
    # start of the word (hissing sounds begin early); other consonants: their own frames
    if take in ("vowel", "glide"):
        lo, hi = max(0, s - FRAME), min(len(a), e + FRAME)
    elif take == "buzz":
        lo, hi = 0, min(len(a), e + 2 * FRAME)
    elif at == 0:
        lo, hi = 0, min(len(a), e)
    else:
        lo, hi = s, len(a) if at + len(target) >= len(spans) else min(len(a), e)
    region = a[lo:hi]
    hop, win = 120, 480
    fr = [(i, region[i:i + win]) for i in range(0, max(1, len(region) - win), hop)]
    peak = max(frame_db(x) for _, x in fr)
    if take == "buzz":
        # both a low "voice bar" and high hiss in the same moment: a real z / zh
        def bands(x):
            sp = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
            f = np.fft.rfftfreq(len(x), 1 / SR)
            t = sp.sum() + 1e-12
            return sp[(f > 60) & (f < 400)].sum() / t, sp[f > 2500].sum() / t
        keep = [i for i, x in fr if frame_db(x) > peak - 20 and min(bands(x)) > 0.12]
    elif take in ("vowel", "glide"):
        keep = [i for i, x in fr if voiced(x) and frame_db(x) > peak - 14]
    else:
        voiced_sound = sym in "vðzʒmnŋlr"
        keep = [i for i, x in fr if voiced(x) == voiced_sound and frame_db(x) > peak - (22 if voiced_sound else 26)]
        if not keep:
            keep = [i for i, x in fr if frame_db(x) > peak - 26]
    if not keep:
        raise ValueError(f"{sym}: nothing found in {src}")
    # the longest run of kept frames
    runs, cur = [], [keep[0]]
    for i in keep[1:]:
        if i - cur[-1] <= hop * 2:
            cur.append(i)
        else:
            runs.append(cur); cur = [i]
    runs.append(cur)
    run = max(runs, key=len)
    seg = region[run[0]:run[-1] + win]
    if take == "vowel":
        seg = extend_voiced(seg, 0.42)
    elif take == "sustain":
        seg = extend_voiced(seg, 0.45) if sym in "vðzʒmnŋlr" else extend_noise(seg, 0.45)
    elif take == "buzz":
        # the low buzz is stretched cycle by cycle, the high hiss as noise, then mixed again
        from scipy.signal import butter, sosfiltfilt
        lo_part = sosfiltfilt(butter(4, 900, "low", fs=SR, output="sos"), seg)
        hi_part = sosfiltfilt(butter(4, 900, "high", fs=SR, output="sos"), seg)
        a1, a2 = extend_voiced(lo_part, 0.45), extend_noise(hi_part, 0.45)
        n = min(len(a1), len(a2))
        seg = a1[:n] + a2[:n]
    return fade(seg, 0.025, 0.06)


# ---------------- checking with Whisper (optional) ----------------
_by_len = {}
def neighbours(word, cmu, lemmas, n=9):
    """Real words that differ from `word` by one sound: the hardest wrong answers."""
    if not _by_len:
        for w, q in cmu.items():
            if w in lemmas and w.isalpha():
                _by_len.setdefault(len(q), []).append((w, [re.sub(r"\d", "", x) for x in q]))
    p = [re.sub(r"\d", "", x) for x in cmu[word]]
    out = []
    for w, q2 in _by_len.get(len(p), []):
        if w != word and sum(a != b for a, b in zip(p, q2)) == 1:
            out.append(w)
    out.sort(key=lambda w: (len(w), w))
    return out[:n]


def whisper_check(jobs, whisper_dir):
    """jobs: [(name, audio, expect, choices)] -> {name: (best, free text)}"""
    from scipy.signal import resample_poly
    tmp = tempfile.mkdtemp()
    spec = []
    for name, audio, expect, choices in jobs:
        pcm = resample_poly(audio, 16000, SR).astype(np.float32)
        pcm = np.concatenate([np.zeros(3200, np.float32), pcm / (np.abs(pcm).max() + 1e-9) * 0.6, np.zeros(3200, np.float32)])
        f = os.path.join(tmp, re.sub(r"\W", "_", name) + ".f32")
        pcm.tofile(f)
        spec.append({"name": name, "file": f, "expect": expect, "choices": choices})
    jf = os.path.join(tmp, "jobs.json")
    json.dump(spec, open(jf, "w"))
    env = dict(os.environ, WB=os.path.join(whisper_dir, "wb"))
    r = subprocess.run(["node", os.path.join(whisper_dir, "asrjs", "score.mjs"), jf], capture_output=True, text=True, env=env,
                       cwd=os.path.join(whisper_dir, "asrjs"))
    if r.returncode:
        raise RuntimeError(r.stderr[-2000:])
    return {x["name"]: (x.get("best", ""), x["free"]) for x in json.loads(r.stdout.strip().splitlines()[-1])}


def encode_opus(a):
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                        "-c:a", "libopus", "-b:a", "24k", "-application", "audio", "-f", "ogg", "pipe:1"],
                       input=a.astype(np.float32).tobytes(), capture_output=True, check=True)
    return base64.b64encode(p.stdout).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True, help="folder with kokoro-q8-shards/ and kokoro-js/ (unpacked npm packages)")
    ap.add_argument("--verify", metavar="WHISPER_DIR", help="folder with wb/ (Xenova whisper-base) and asrjs/score.mjs")
    ap.add_argument("--wav-dir", help="also save every clip as .wav here, to listen to")
    ap.add_argument("--only", help="comma-separated sound ids, to redo a few")
    args = ap.parse_args()

    k = Kokoro(args.model_dir)
    cmu = load_cmu()
    out_path = os.path.join(HERE, "sounds-audio.json")
    old = json.load(open(out_path)) if os.path.exists(out_path) else {"audio": {}}
    audio = old.get("audio", {})
    only = set(args.only.split(",")) if args.only else None

    words = []
    for it in SOUNDS:
        if only and it["id"] not in only:
            continue
        words += [it["key"]] + it["ex"] + [w for pair in it["pairs"] for w in pair]
    words = list(dict.fromkeys(words))
    missing = [w for w in words if w not in cmu]
    if missing:
        sys.exit("not in the pronunciation dictionary: " + ", ".join(missing))

    clips = {}
    report = []
    # 1. words: record, check, re-record if needed
    lemmas = None
    if args.verify:
        with gzip.open(os.path.join(HERE, "wordnet-compact.txt.gz"), "rt", encoding="utf-8") as f:
            lemmas = {ln.split("\t", 1)[0] for ln in f}
    pending = {w: [0.9, 1.0, 0.8] for w in words}
    done = {}
    while pending:
        batch = {}
        for w, speeds in list(pending.items()):
            if not speeds:
                del pending[w]
                report.append(f"word {w}: no recording passed the check (kept the last one)")
                continue
            sp = speeds.pop(0)
            a, _, whole = record_word(k, to_misaki(cmu[w]), sp)
            batch[w] = (normalize(a), sp, whole)
            done[w] = batch[w][0]
        if not args.verify:
            break
        jobs = []
        for w, (a, sp, whole) in batch.items():
            # check the whole phrase: with "Listen." before it, the recognizer can tune in to the voice
            choices = ["listen. " + x for x in [w] + [x for x in neighbours(w, cmu, lemmas) if x != w]]
            jobs.append((f"{w}@{sp}", whole, "listen. " + w, choices))
        res = whisper_check(jobs, args.verify)
        for w, (a, sp, whole) in batch.items():
            best, free = res[f"{w}@{sp}"]
            best = best.replace("listen. ", "")
            if best == w:
                pending.pop(w, None)
            else:
                report.append(f"word {w} (speed {sp}): heard as {best!r} ({free!r})" + ("; trying again" if pending.get(w) else ""))
    for w, a in done.items():
        clips["w:" + w] = a

    # 2. single sounds
    for it in SOUNDS:
        if only and it["id"] not in only:
            continue
        a = normalize(take_sound(k, it))
        clips["s:" + it["id"]] = a
        report.append(f"sound /{it['sym']}/ ({it['take']}): {len(a) / SR:.2f}s")

    for name, a in clips.items():
        audio[name] = encode_opus(a)
        if args.wav_dir:
            import soundfile as sf
            os.makedirs(args.wav_dir, exist_ok=True)
            sf.write(os.path.join(args.wav_dir, re.sub(r"[^\w-]", "_", name) + ".wav"), a, SR)
    json.dump({"voice": f"Kokoro-82M ({VOICE})", "format": "audio/ogg; codecs=opus", "audio": dict(sorted(audio.items()))},
              open(out_path, "w"), separators=(",", ":"))
    print("\n".join(report))
    size = os.path.getsize(out_path) // 1024
    print(f"{len(audio)} clips, {size} KB -> {os.path.relpath(out_path)}")


if __name__ == "__main__":
    main()
