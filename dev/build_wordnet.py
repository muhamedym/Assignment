"""Build the app's offline dictionary from WordNet 3.1.

For each word it keeps: parts of speech, the most common meaning, up to two
example sentences that use the word, similar words and the word family
(derivationally related forms). Output: dev/wordnet-compact.txt.gz, which
build.py embeds in the app.

Usage:
  python3 dev/build_wordnet.py /path/to/wordnet/dict

The WordNet files come from the npm package "wordnet-db" (WordNet 3.1,
Princeton University; see dev/wordnet-LICENSE.txt):
  npm pack wordnet-db && tar xzf wordnet-db-*.tgz   -> package/dict
"""
import gzip
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "wordnet-compact.txt.gz")
CMU = os.path.join(HERE, "cmudict-full.txt.gz")
POS_FILES = {"n": "noun", "v": "verb", "a": "adj", "r": "adv"}


def norm_pos(p):
    return "a" if p == "s" else p


def read_data(d):
    """synset key (pos, offset) -> {words, ptrs, gloss, examples}"""
    syn = {}
    for p, name in POS_FILES.items():
        with open(os.path.join(d, "data." + name), encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("  "):
                    continue
                head, _, gloss = line.partition(" | ")
                t = head.split()
                off, ss_type, w_cnt = t[0], t[2], int(t[3], 16)
                words = []
                i = 4
                for _ in range(w_cnt):
                    w = re.sub(r"\((a|p|ip)\)$", "", t[i])
                    words.append(w.replace("_", " "))
                    i += 2
                p_cnt = int(t[i]); i += 1
                ptrs = []
                for _ in range(p_cnt):
                    sym, toff, tpos, st = t[i], t[i + 1], t[i + 2], t[i + 3]
                    ptrs.append((sym, toff, norm_pos(tpos), int(st[:2], 16), int(st[2:], 16)))
                    i += 4
                gloss = gloss.strip()
                examples = re.findall(r'"([^"]+)"', gloss)
                definition = re.split(r';\s*"', gloss)[0].strip().rstrip(";").strip()
                syn[(norm_pos(ss_type), off)] = {"words": words, "ptrs": ptrs, "def": definition, "ex": examples}
    return syn


def read_index(d):
    """lemma -> list of (pos, [offsets in frequency order], tagged sense count)"""
    idx = {}
    for p, name in POS_FILES.items():
        with open(os.path.join(d, "index." + name), encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("  "):
                    continue
                t = line.split()
                lemma, synset_cnt, p_cnt = t[0], int(t[2]), int(t[3])
                tag_cnt = int(t[5 + p_cnt])
                offsets = t[6 + p_cnt:6 + p_cnt + synset_cnt]
                idx.setdefault(lemma.replace("_", " "), []).append((p, offsets, tag_cnt))
    return idx


def forms(lemma):
    """The word and its regular inflections, to check that an example really uses it."""
    w = lemma.lower()
    out = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "est", w + "ly"}
    if w.endswith("y"):
        out |= {w[:-1] + "ies", w[:-1] + "ied", w[:-1] + "ier", w[:-1] + "iest", w[:-1] + "ily"}
    if w.endswith("e"):
        out |= {w[:-1] + "ing", w[:-1] + "ed"}
    if re.search(r"[^aeiou][aeiou][bdgklmnprt]$", w):
        out |= {w + w[-1] + "ed", w + w[-1] + "ing", w + w[-1] + "er"}
    return out


def uses_word(example, lemma):
    ex = example.lower()
    if " " in lemma:
        return lemma.lower() in ex
    toks = set(re.findall(r"[a-z]+(?:'[a-z]+)?", ex))
    return bool(toks & forms(lemma))


def example_score(ex, sense_rank):
    words = len(ex.split())
    s = sense_rank * 2.0
    if words < 4:
        s += 6            # a phrase, not a sentence
    elif words < 6:
        s += 2
    if len(ex) > 110:
        s += 3
    if re.search(r"[`'\"]\w+'|--|\(|\)|\[|;|:", ex):
        s += 4            # quoted terms, dashes, brackets: usually awkward to read aloud
    return s


def readable(ex):
    """A plain sentence of at least four words: no quoted terms, dashes or brackets."""
    if len(ex.split()) < 4:
        return False
    return not re.search(r"`|'\w[^']*'(?!\w)|--|[()\[\]{}]|\.\.\.", ex)


def clean_example(ex):
    ex = re.sub(r"\s+", " ", ex).strip()
    ex = ex[0].upper() + ex[1:]
    if not re.search(r"[.!?]$", ex):
        ex += "."
    return ex


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "wordnet", "dict")
    syn = read_data(d)
    idx = read_index(d)
    with gzip.open(CMU, "rt", encoding="utf-8") as f:
        lines = f.read().split("\n")
    cmu = {ln.split(" ", 1)[0] for ln in lines[1:] if ln}

    out_lines = []
    kept = 0
    for lemma, entries in sorted(idx.items()):
        parts = lemma.split(" ")
        if not re.fullmatch(r"[a-z][a-z'-]*( [a-z][a-z'-]*){0,2}", lemma):
            continue
        if not all(p in cmu or p.replace("-", "") in cmu for p in parts):
            continue
        tag_total = sum(e[2] for e in entries)
        if len(parts) > 1 and tag_total == 0 and not any(e[0] == "v" for e in entries):
            continue          # rare multi-word terms (species, places…), except phrasal verbs
        # parts of speech, most used first
        entries = sorted(entries, key=lambda e: (-e[2], -len(e[1])))
        pos_list = []
        for p, _, _ in entries:
            if p not in pos_list:
                pos_list.append(p)
        top_pos, top_offsets, _ = entries[0]
        first = syn.get((top_pos, top_offsets[0]))
        if not first:
            continue
        meaning = first["def"]
        # examples that use the word, best first
        cands = []
        rank = 0
        for p, offsets, _ in entries:
            for off in offsets:
                s = syn.get((p, off))
                if s:
                    for ex in s["ex"]:
                        if uses_word(ex, lemma) and 8 <= len(ex) <= 160 and readable(ex):
                            cands.append((example_score(ex, rank), clean_example(ex)))
                rank += 1
        cands.sort(key=lambda c: c[0])
        examples = []
        for _, ex in cands:
            if ex not in examples:
                examples.append(ex)
            if len(examples) == 2:
                break
        # similar words: other words in the first two senses of the main part of speech
        syns = []
        for off in top_offsets[:2]:
            s = syn.get((top_pos, off))
            for w in (s["words"] if s else []):
                wl = w.lower()
                if wl != lemma and wl not in syns and re.fullmatch(r"[a-z][a-z' -]*", wl):
                    syns.append(wl)
        syns = syns[:5]
        # word family: derivationally related forms (+), pertainyms (\) and attributes (=)
        fam = []
        for p, offsets, _ in entries:
            for off in offsets:
                s = syn.get((p, off))
                if not s:
                    continue
                my_index = [i + 1 for i, w in enumerate(s["words"]) if w.lower() == lemma]
                for sym, toff, tpos, src, tgt in s["ptrs"]:
                    if sym not in ("+", "\\", "="):
                        continue
                    if src and src not in my_index:
                        continue
                    t = syn.get((tpos, toff))
                    if not t:
                        continue
                    targets = [t["words"][tgt - 1]] if tgt else t["words"][:1]
                    for w in targets:
                        wl = w.lower()
                        if wl != lemma and " " not in wl and re.fullmatch(r"[a-z][a-z'-]*", wl):
                            item = f"{wl}:{tpos}"
                            if item not in fam and not any(x.startswith(wl + ":") for x in fam):
                                fam.append(item)
        fam = fam[:6]
        out_lines.append("\t".join([lemma, "".join(pos_list), meaning, "|".join(examples), ",".join(syns), ",".join(fam)]))
        kept += 1

    text = "\n".join(out_lines) + "\n"
    with gzip.open(OUT, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(text)
    with_ex = sum(1 for ln in out_lines if ln.split("\t")[3])
    print(f"{kept} words ({with_ex} with an example sentence); {len(text) // 1024} KB text, "
          f"{os.path.getsize(OUT) // 1024} KB compressed -> {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
