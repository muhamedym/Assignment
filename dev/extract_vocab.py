"""Extract the dictation vocabulary from the IELTS .docx and write vocab.json.

Usage:  python -I dev/extract_vocab.py <document.docx> <output.json>

Only the answer column of each table is used as a test answer:
  1 Personal spelling priorities -> "Correct spelling"  (not "Your earlier spelling")
  2 Listening spelling priorities -> "Correct spelling"
  3 Academic Writing Task 1       -> "Word or phrase"
  4 Academic Writing Task 2       -> "Word"
Other columns are kept only as feedback shown after an answer is submitted.
"""
import json
import re
import sys

import docx

# Which column holds the answer, keyed by the heading text that precedes each table.
SECTIONS = [
    ("personal", "personal spelling priorities", "Correct spelling", {"Remember": "hint"}),
    ("listening", "listening spelling priorities", "Correct spelling", {"Category": "group", "Remember": "hint"}),
    ("task1", "academic writing task 1", "Word or phrase", {"Use": "group", "Example": "example"}),
    ("task2", "academic writing task 2", "Word", {"Category": "group", "Natural phrase or example": "example"}),
]

# Words that sound like other words: a short context is spoken after the word.
SPOKEN_CONTEXT = {
    "principle": "principle, as in, a basic rule or belief",
    "peak": "peak, as in, the highest point",
}

# UK spellings that must not appear; the app uses US spelling.
UK_PATTERNS = [r"our(ful|s)?$", r"tre$", r"ise$", r"isation$", r"yse$", r"ogue$", r"lled$", r"lling$"]
UK_ALLOWED = {"colleague", "travelling", "advertise", "exercise", "otherwise", "surprise", "compromise",
              "enterprise", "expertise", "supervise", "televise", "revise", "advise", "rise", "wise", "four", "hour",
              "our", "your", "tour", "pour", "flour", "sour", "devour"}


def norm(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def key(s):
    return norm(s).lower()


def main(src, out):
    d = docx.Document(src)
    body = d.element.body
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    current = None
    table_index = 0
    paragraphs_after = {}
    tables = {}
    for el in body.iterchildren():
        if el.tag == W + "p":
            text = norm("".join(t.text or "" for t in el.iter(W + "t")))
            low = text.lower()
            for cat, heading, _, _ in SECTIONS:
                if heading in low and len(low) < 60:
                    current = cat
            if current and text:
                paragraphs_after.setdefault(current, []).append(text)
        elif el.tag == W + "tbl":
            tbl = d.tables[table_index]
            table_index += 1
            if current is None or current in tables:
                raise SystemExit(f"Unexpected table #{table_index} (section {current!r})")
            tables[current] = tbl

    items, seen = [], {}
    for cat, _, answer_col, extra_cols in SECTIONS:
        tbl = tables.get(cat)
        if tbl is None:
            raise SystemExit(f"Missing table for section {cat}")
        header = [norm(c.text) for c in tbl.rows[0].cells]
        if answer_col not in header:
            raise SystemExit(f"{cat}: column {answer_col!r} not found in {header}")
        ai = header.index(answer_col)
        for row in tbl.rows[1:]:
            cells = [norm(c.text) for c in row.cells]
            word = cells[ai]
            if not word:
                continue
            k = key(word)
            if k in seen:  # duplicate: keep the first (higher-priority) entry
                seen[k].setdefault("alsoIn", []).append(cat)
                continue
            item = {"id": "b-" + re.sub(r"[^a-z0-9]+", "-", k).strip("-"), "word": word, "cat": cat}
            for col, field in extra_cols.items():
                if col in header and cells[header.index(col)]:
                    item[field] = cells[header.index(col)]
            if k in SPOKEN_CONTEXT:
                item["context"] = SPOKEN_CONTEXT[k]
            seen[k] = item
            items.append(item)

    # Task 2 "Spelling reminders: environment includes n before m; government keeps ..." -> hints.
    for p in paragraphs_after.get("task2", []):
        if p.lower().startswith("spelling reminders:"):
            for part in p.split(":", 1)[1].split(";"):
                part = part.strip().rstrip(".")
                w = part.split(" ", 1)[0].lower()
                if w in seen and "hint" not in seen[w]:
                    seen[w]["hint"] = part[len(w):].strip()

    # Safety checks.
    earlier = set()
    t0 = tables["personal"]
    h0 = [norm(c.text) for c in t0.rows[0].cells]
    for row in t0.rows[1:]:
        for variant in norm(row.cells[h0.index("Your earlier spelling")].text).split("/"):
            earlier.add(key(variant))
    leaked = [i["word"] for i in items if key(i["word"]) in earlier]
    if leaked:
        raise SystemExit(f"Earlier misspellings leaked into answers: {leaked}")
    for i in items:
        w = key(i["word"])
        for pat in UK_PATTERNS:
            if re.search(pat, w) and w not in UK_ALLOWED:
                raise SystemExit(f"Possible UK spelling: {i['word']}")

    with open(out, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    counts = {c: sum(1 for i in items if i["cat"] == c) for c, *_ in SECTIONS}
    print(f"{len(items)} words written to {out}: {counts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
