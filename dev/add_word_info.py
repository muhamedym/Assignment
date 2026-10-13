"""Merge dev/wordinfo/*.txt (part of speech, meaning, sentence, word family) into vocab.json.

Usage:  python -I dev/add_word_info.py        (run after extract_vocab.py and build_listening_hf.py)
Checks: every word has exactly one entry, no field is empty, and every example sentence
contains the exact word (a phrase's words must appear in order), so "Say a sentence"
always lets you hear the word being tested.
"""
import json
import pathlib
import re

here = pathlib.Path(__file__).resolve().parent
VOCAB = here / "vocab.json"

# Text-to-speech fixes: what the voice should say instead of the written answer.
SAY = {
    "resume": "résumé",      # otherwise read as the verb "re-ZOOM"
    "SARS": "Sars",          # otherwise some voices spell out S-A-R-S
}


def key(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def contains(sentence, word):
    s = key(sentence).replace("-", " ")
    tokens = key(word).replace("-", " ").split()
    pos = 0
    for t in tokens:
        m = re.compile(r"\b" + re.escape(t) + r"\b").search(s, pos)
        if not m:
            return False
        pos = m.end()
    return True


def main():
    info, problems = {}, []
    for f in sorted((here / "wordinfo").glob("*.txt")):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 5 or not all(parts):
                problems.append(f"{f.name}:{n}: needs 5 non-empty fields")
                continue
            word, pos, meaning, sentence, family = parts
            if key(word) in info:
                problems.append(f"{f.name}:{n}: duplicate entry for {word}")
            if not contains(sentence, word):
                problems.append(f"{f.name}:{n}: sentence does not contain '{word}': {sentence}")
            if not re.search(r"[.!?]$", sentence):
                problems.append(f"{f.name}:{n}: sentence should end with punctuation")
            info[key(word)] = {"pos": pos, "meaning": meaning, "sentence": sentence, "family": family}
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    words = {key(v["word"]) for v in vocab if v["cat"] != "reading"}  # reading words carry their own info
    for w in sorted(words - set(info)):
        problems.append(f"no word info for: {w}")
    for w in sorted(set(info) - words):
        problems.append(f"word info for a word not in the vocabulary: {w}")
    if problems:
        raise SystemExit("\n".join(problems))
    for v in vocab:
        if v["cat"] == "reading":
            continue
        v.update(info[key(v["word"])])
        if v["word"] in SAY:
            v["say"] = SAY[v["word"]]
    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Word info added to all {len(vocab)} words.")


if __name__ == "__main__":
    main()
