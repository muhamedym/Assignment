"""Append the Academic Reading words (dev/reading_words.txt) to vocab.json as category "reading".

Usage:  python -I dev/build_reading.py   (run after add_word_info.py; re-runnable)
Each line: topic | word | part of speech | meaning | example sentence | word family.
Checks: no empty fields, sentence contains the exact word, no duplicate of a word already in the app.
"""
import json
import pathlib
import re
import sys

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here))
from add_word_info import contains, key  # noqa: E402

VOCAB = here / "vocab.json"


def main():
    vocab = [v for v in json.loads(VOCAB.read_text(encoding="utf-8")) if v["cat"] != "reading"]
    seen = {key(v["word"]) for v in vocab}
    problems, added = [], 0
    for n, line in enumerate((here / "reading_words.txt").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 6 or not all(parts):
            problems.append(f"line {n}: needs 6 non-empty fields"); continue
        topic, word, pos, meaning, sentence, family = parts
        if key(word) in seen:
            problems.append(f"line {n}: '{word}' is already in the app"); continue
        if not contains(sentence, word):
            problems.append(f"line {n}: sentence does not contain '{word}'")
        seen.add(key(word))
        vocab.append({"id": "r-" + re.sub(r"[^a-z0-9]+", "-", key(word)).strip("-"), "word": word, "cat": "reading",
                      "group": topic, "pos": pos, "meaning": meaning, "sentence": sentence, "family": family})
        added += 1
    if problems:
        raise SystemExit("\n".join(problems))
    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Added {added} reading words.")


if __name__ == "__main__":
    main()
