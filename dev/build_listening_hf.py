"""Turn listening_hf_source.txt into dictation entries and append them to vocab.json.

Usage:  python -I dev/build_listening_hf.py
Re-runnable: earlier "hf" entries in vocab.json are replaced.

Cleaning rules (each answer must be one clear US spelling you can type from hearing it):
  * "A/B" alternatives become separate words (waiter, waitress), as does the doctor line.
  * "sb." -> "someone"; trailing "…" removed; lower case except SARS and TV.
  * UK -> US spelling, and a few compounds written the usual US way (see SPELLING).
  * Duplicates of words already in the app (or repeated in the list) are skipped.
"""
import json
import pathlib
import re

here = pathlib.Path(__file__).resolve().parent
SRC, OUT = here / "listening_hf_source.txt", here / "vocab.json"

SPELLING = {  # source -> US form used as the answer
    "catalogue": "catalog", "anaesthetist": "anesthetist", "plough through": "plow through",
    "drop-out": "dropout", "hard-working": "hardworking", "house-warming party": "housewarming party",
    "hitch-hike": "hitchhike", "roundtrip": "round-trip", "post doctorate": "post-doctorate",
    "the student's union": "student union", "have no match for…": "have no match for",
    "call on sb.": "call on someone", "join sb. for dinner": "join someone for dinner",
    "go dutch": "go Dutch",
}
SPLIT = {
    "alumni/alumnus": ["alumni", "alumnus"], "elective/optional course": ["elective course", "optional course"],
    "opening/vacancy": ["opening", "vacancy"], "waiter/waitress": ["waiter", "waitress"],
    "attending/chief doctor；physician；consultant": ["attending doctor", "chief doctor", "physician", "consultant"],
    "tube/underground": ["tube", "underground"], "expressway/freeway": ["expressway", "freeway"],
    "landlord/landlady": ["landlord", "landlady"], "apartment/flat": ["apartment", "flat"],
    "refrigerator/fridge": ["refrigerator", "fridge"],
}
KEEP_CASE = {"sars": "SARS", "tv channels": "TV channels", "tv theater": "TV theater", "go dutch": "go Dutch"}
# Sound-alikes: a short meaning is spoken after the two readings.
CONTEXT = {
    "stationery": "stationery, as in, paper and pens", "dessert": "dessert, as in, sweet food after a meal",
    "leak": "leak, as in, water escaping from a pipe", "hire": "hire, as in, to employ someone",
    "symbol": "symbol, as in, a sign that stands for something", "flat": "flat, as in, an apartment",
    "wear out": "wear out, as in, to make very tired", "fine": "fine, as in, money you pay as a penalty",
    "mall": "mall, as in, a shopping center", "tube": "tube, as in, the London underground",
    "date": "date, as in, a day on the calendar", "done": "done, as in, cooked enough",
    "change": "change, as in, the coins you get back", "medium": "medium, as in, a steak cooked medium",
    "raw": "raw, as in, not cooked", "bid": "bid, as in, an offer of money",
    "staple": "staple, as in, basic food", "fire": "fire, as in, to dismiss from a job",
}

US_OK = {"compromise", "through", "exercise", "supervisor", "your", "downpour"}  # US spellings that look British to the check


def key(s):
    return re.sub(r"\s+", " ", s.replace("’", "'")).strip().lower()


def main():
    vocab = [v for v in json.loads(OUT.read_text(encoding="utf-8")) if v["cat"] != "hf"]
    seen = {key(v["word"]): v for v in vocab}
    topic = sub = None
    added, skipped = [], []
    for raw in SRC.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("== "):
            topic, sub = line[3:], None
            continue
        if line.startswith("-- "):
            sub = line[3:]
            continue
        k = key(line)
        for w in SPLIT.get(k, [k]):
            w = SPELLING.get(w, w)
            w = KEEP_CASE.get(w.lower(), w)
            if key(w) in seen:
                skipped.append((w, seen[key(w)]["cat"]))
                continue
            item = {"id": "h-" + re.sub(r"[^a-z0-9]+", "-", key(w)).strip("-"), "word": w, "cat": "hf",
                    "group": f"{topic} › {sub}" if sub else topic}
            if key(line) != key(w):
                item["hint"] = f"Listed as “{line.replace('’', chr(39))}”"
            if key(w) in CONTEXT:
                item["context"] = CONTEXT[key(w)]
            seen[key(w)] = item
            vocab.append(item)
            added.append(w)
    for w in added:
        assert re.fullmatch(r"[A-Za-z][A-Za-z' -]*[A-Za-z]", w), w
        flagged = [t for t in key(w).split() if re.search(r"(our|tre|ise|isation|ogue|lled|lling|ough|aes|ae)$|ae", t)]
        bad = [t for t in flagged if t not in US_OK]
        assert not bad, (w, bad)
    OUT.write_text(json.dumps(vocab, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Added {len(added)} words; skipped {len(skipped)} duplicates: {skipped}")


if __name__ == "__main__":
    main()
