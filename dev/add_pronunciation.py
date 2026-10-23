"""Add American pronunciation to vocab.json: IPA, syllables, and a letter-to-sound breakdown
(which letters make which sound, silent letters, double letters).

Usage:  python -I dev/add_pronunciation.py [path/to/cmudict.dict]
Run after the other vocab steps (extract_vocab, build_listening_hf, add_word_info, build_reading).

Source: the CMU Pronouncing Dictionary (American English; BSD-style licence, see
dev/cmudict-subset.txt). Only the entries this app needs are kept in dev/cmudict-subset.txt, so
later runs work offline; pass the full cmudict.dict path to refresh that subset.

Each vocab item gets:
  ipa    "/əˌkɑməˈdeɪʃən/"
  syl    "ac·com·mo·da·tion"
  parts  [[letters, ipa, flag], ...]   flag: "" sound, "s" silent, "e" silent e (long vowel),
                                       "d" double letter (one sound), " " word gap
"""
import json
import pathlib
import re
import sys

here = pathlib.Path(__file__).resolve().parent
VOCAB = here / "vocab.json"
SUBSET = here / "cmudict-subset.txt"

# Pronunciations chosen by hand where the dictionary's first entry is the wrong word or form.
OVERRIDES = {
    "resume": "R EH1 Z AH0 M EY2",          # the job document (résumé), not the verb
    "live": "L AY1 V",                       # "live broadcast"
    "read": "R IY1 D",                       # "read selectively / extensively"
    "address": "AE1 D R EH2 S",              # US noun
    "sars": "S AA1 R Z",
    "tv": "T IY1 V IY1",
    "february": "F EH1 B R UW0 EH2 R IY0",   # keeps the first r (standard alternative)
    "curriculum": "K ER0 R IH1 K Y AH0 L AH0 M".replace("ER0", "AH0"),
    "fluctuate": "F L AH1 K CH UW0 EY2 T",
    "housewarming": "HH AW1 S W AO2 R M IH0 NG",  # dictionary entry drops the r
}
SYL_OVERRIDES = {"transport": "trans·port", "inexperienced": "in·ex·pe·ri·enced", "fire": "fire", "hire": "hire",
                 "empire": "em·pire", "bankrupt": "bank·rupt", "cupboard": "cup·board", "laboratory": "lab·o·ra·to·ry",
                 "temperature": "tem·per·a·ture", "theory": "the·o·ry", "algorithm": "al·go·rithm",
                 "workaholic": "work·a·hol·ic", "adolescent": "ad·o·les·cent", "deforestation": "de·for·es·ta·tion",
                 "sustainable": "sus·tain·a·ble", "heater": "heat·er", "electronic": "e·lec·tron·ic", "software": "soft·ware"}
# Abbreviations read as letter names.
LETTER_NAMES = {"tv": [["T", "ti", ""], ["V", "vi", ""]]}
# Not in the dictionary: built from parts.
COMPOUNDS = {
    "housemaid": ["house", "maid"], "sideboard": ["side", "board"], "stomachache": ["stomach", "ache"],
    "toothache": ["tooth", "ache"], "unfurnished": ["un", "furnished"],
}
UN = "AH0 N"  # "un" prefix

VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
IPA = {"AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "EY": "eɪ", "IH": "ɪ", "IY": "i",
       "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u", "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f",
       "G": "g", "HH": "h", "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r",
       "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}


def ipa_of(ph):
    base, stress = re.match(r"([A-Z]+)(\d?)", ph).groups()
    if base == "AH":
        return "ə" if stress == "0" else "ʌ"
    if base == "ER":
        return "ɚ" if stress == "0" else "ɝ"
    return IPA[base]


# Spelling patterns (graphemes) and the sounds they can make, most common first.
G = {
    "b": ["B"], "bb": ["B"], "c": ["K", "S", "SH", "CH"], "cc": ["K", "K S"], "ch": ["CH", "K", "SH"], "ck": ["K"],
    "ci": ["SH"], "ce": ["SH"], "d": ["D", "JH", "T"], "dd": ["D"], "dg": ["JH"], "f": ["F"], "ff": ["F"],
    "g": ["G", "JH", "ZH"], "gg": ["G"], "gh": ["F", "G"], "gu": ["G", "G W"], "h": ["HH"], "j": ["JH"], "k": ["K"],
    "l": ["L", "AH L"], "ll": ["L"], "m": ["M", "AH M"], "mm": ["M"], "n": ["N", "NG", "AH N"], "nn": ["N"],
    "ng": ["NG", "NG G"], "p": ["P"], "pp": ["P"], "ph": ["F"], "q": ["K"], "qu": ["K W", "K"],
    "r": ["R", "ER"], "rr": ["R"], "s": ["S", "Z", "SH", "ZH"], "ss": ["S", "SH", "Z"], "sh": ["SH"],
    "si": ["ZH", "SH"], "ssi": ["SH"], "sci": ["SH"], "sc": ["S", "SH"], "sch": ["SH", "S K"], "t": ["T", "CH", "SH", "D"], "tt": ["T"],
    "th": ["TH", "DH", "T"], "ti": ["SH", "CH"], "tch": ["CH"], "v": ["V"], "w": ["W"], "wh": ["W", "HH"],
    "x": ["K S", "G Z", "Z", "K SH"], "xi": ["K SH"], "y": ["Y", "IY", "AY", "IH", "AH"], "z": ["Z", "S"], "zz": ["Z"],
    "a": ["AE", "EY", "AA", "AH", "AO", "EH", "IH", "ER"], "ai": ["EY", "EH", "AH", "IH"], "ay": ["EY", "IY"],
    "au": ["AO", "AA", "AH"], "aw": ["AO", "AA"], "e": ["EH", "IY", "AH", "IH", "EY", "ER"],
    "ea": ["IY", "EH", "EY"], "ee": ["IY"], "ei": ["IY", "EY", "AY", "IH", "AH"], "ey": ["IY", "EY"],
    "eu": ["UW", "Y UW"], "ew": ["UW", "Y UW"], "eo": ["AH", "IY"], "i": ["IH", "AY", "IY", "AH", "Y", "ER"],
    "ie": ["IY", "AY", "IH"], "igh": ["AY"], "o": ["AA", "OW", "AH", "AO", "UW", "UH", "W AH", "ER"], "oa": ["OW", "AO"],
    "oo": ["UW", "UH", "AH"], "ou": ["AW", "AH", "UW", "OW", "UH", "AO", "ER"], "ow": ["AW", "OW"], "oi": ["OY"],
    "oy": ["OY"], "oe": ["OW"], "u": ["AH", "UW", "Y UW", "UH", "IH", "W", "Y AH", "ER", "Y UH"],
    "ue": ["UW", "Y UW"], "ui": ["UW", "IH", "W IH"], "er": ["ER"], "ir": ["ER"], "ur": ["ER"], "or": ["ER"],
    "ar": ["ER"], "ear": ["ER"], "our": ["ER"], "yr": ["ER"], "eur": ["ER"], "ae": ["IY", "EH", "EY"], "urr": ["ER"], "err": ["ER"], "arr": ["ER"], "orr": ["ER"],
}
G = {k: [tuple(p.split()) for p in v] for k, v in G.items()}
# Letters that are often silent, and how readily (lower = more likely).
SILENT = {"e": 1.0, "h": 1.2, "gh": 1.0, "ue": 1.5, "b": 1.5, "p": 1.5, "n": 1.5, "k": 1.5, "w": 1.5, "g": 1.5,
          "t": 1.8, "l": 1.8, "d": 1.8, "u": 1.8, "s": 1.8, "c": 1.8, "i": 2.0, "a": 2.0, "o": 2.0}
FALLBACK = 4.0


def align(word, phones):
    """Cheapest split of the spelling into graphemes, each mapped to 0+ phonemes (dynamic programming)."""
    w = word.lower()
    ph = [re.sub(r"\d", "", p) for p in phones]
    n, m = len(w), len(ph)
    INF = float("inf")
    best = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    best[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            c = best[i][j]
            if c == INF:
                continue
            moves = []
            for L in (1, 2, 3):
                g = w[i:i + L]
                if len(g) < L:
                    break
                for k, seq in enumerate(G.get(g, [])):
                    if tuple(ph[j:j + len(seq)]) == seq:
                        extra = 1.2 if len(seq) == 2 and seq[0] == "AH" and g in "lmn" else 0.0
                        moves.append((i + L, j + len(seq), 1.0 + 0.01 * k + extra))
                if g in SILENT:
                    moves.append((i + L, j, SILENT[g]))
            if i < n and j < m:
                moves.append((i + 1, j + 1, FALLBACK))      # unusual letter-sound match
            if i < n:
                moves.append((i + 1, j, FALLBACK))          # unusual silent letter
            if j < m and i > 0:
                moves.append((i, j + 1, FALLBACK))          # sound with no letter of its own
            for ni, nj, cost in moves:
                if c + cost < best[ni][nj]:
                    best[ni][nj] = c + cost
                    back[ni][nj] = (i, j)
    parts, i, j = [], n, m
    while (i, j) != (0, 0):
        pi, pj = back[i][j]
        if pi == i and parts:   # extra sound: attach it to the following part
            parts[0][1] = list(range(pj, j)) + parts[0][1]
        else:
            parts.insert(0, [word[pi:i], list(range(pj, j))])
        i, j = pi, pj
    return parts, best[n][m]


ONSETS = {tuple(o.split()) for o in """P L,P R,B L,B R,T R,D R,K L,K R,G L,G R,F L,F R,TH R,SH R,S P,S T,S K,S M,S N,S L,S W,
T W,D W,K W,G W,P Y,B Y,F Y,M Y,K Y,V Y,HH Y,TH W,S P L,S P R,S T R,S K R,S K W,S K Y,S P Y""".replace("\n", "").split(",")}


def syllabify(phones, word=""):
    """Syllable start index for each syllable (maximal onset)."""
    base = [re.sub(r"\d", "", p) for p in phones]
    nuclei = [k for k, p in enumerate(base) if p in VOWELS]
    starts = [0]
    for a, b in zip(nuclei, nuclei[1:]):
        cons = base[a + 1:b]
        split = len(cons)  # default: all consonants go to the next syllable's onset... then shrink to a legal onset
        for s in range(len(cons) + 1):
            onset = tuple(cons[s:])
            if not onset or len(onset) == 1 and onset[0] != "NG" or onset in ONSETS:
                split = s
                break
        stress = re.sub(r"\D", "", phones[a])
        if stress in ("1", "2") and base[a] in {"IH", "EH", "AE", "AH", "UH", "AA"}:
            onset = cons[split:]
            if len(cons) == 1 and cons[0] not in {"SH", "ZH"}:
                split = 1                       # nec·es·sar·y: a single consonant closes the stressed syllable
            elif split == 0 and len(onset) >= 2 and onset[0] == "S":
                split += 1                      # res·tau·rant: s + consonant are split

        if b == nuclei[-1] and word.lower().endswith("ing") and base[b:] == ["IH", "NG"] and len(cons) <= 2:
            split = len(cons)
        starts.append(a + 1 + split)
    return starts, nuclei


# Real compound words in the vocabulary: syllables and letters are worked out per part (house·work).
COMPOUND_WORDS = """broadcast cyberspace downpour downtown dropout ecosystem expressway forecast freeway hallway
hardworking hitchhike household housekeeper housewarming housewife housework however keyword landlady landlord
multimedia neighborhood outlet overall overdue overweight overwork paperback prototype someone sometimes streetcar
subway supervisor therefore transaction underground workload whereas makeup""".split()


def split_compound(word, phones, cmu):
    """house+work: a listed compound whose two parts' sounds add up to the whole word."""
    w = word.lower()
    if w not in COMPOUND_WORDS:
        return None
    bare = [re.sub(r"\d", "", p) for p in phones]
    for i in range(2, len(w) - 1):
        a, b = w[:i], w[i:]
        if a in cmu and b in cmu and [re.sub(r"\d", "", p) for p in cmu[a] + cmu[b]] == bare:
            second = phones[len(cmu[a]):]
            first_has_primary = any(p.endswith("1") for p in phones[:len(cmu[a])])
            if first_has_primary:
                second = [p.replace("1", "2") for p in second]
            return [(word[:i], phones[:len(cmu[a])]), (word[i:], second)]
    raise SystemExit(f"compound '{word}' could not be split into two dictionary words")


def compound_entry(word, phones, cmu):
    w = word.lower()
    if w in COMPOUNDS and COMPOUNDS[w][0] != "un":
        pieces, k, pos = [], 0, 0
        for piece in COMPOUNDS[w]:
            n = len(cmu[piece])
            pieces.append((word[pos:pos + len(piece)], phones[k:k + n]))
            k += n; pos += len(piece)
    else:
        pieces = split_compound(word, phones, cmu)
    if not pieces:
        return word_entry(word, phones)
    ipa, syl, parts, cost = "", [], [], 0.0
    for piece, ph in pieces:
        i, s_, p, c = word_entry(piece, ph, mark_single=True)
        ipa += i; syl.append(s_); parts += p; cost += c
    return ipa, "·".join(syl), parts, cost


def word_entry(word, phones, mark_single=False):
    parts, cost = align(word, phones)
    starts, nuclei = syllabify(phones, word)
    # syllable stress marks and IPA
    ipa = ""
    for s, st in enumerate(starts):
        end = starts[s + 1] if s + 1 < len(starts) else len(phones)
        stress = next((re.sub(r"\D", "", p) for p in phones[st:end] if re.sub(r"\d", "", p) in VOWELS), "0")
        mark = "ˈ" if stress == "1" and (len(starts) > 1 or mark_single) else "ˌ" if stress == "2" else ""
        ipa += mark + "".join(ipa_of(p) for p in phones[st:end])
    # syllables in spelling: a boundary before phoneme k goes before the letters that make it
    owner = {}
    for pi, (_, idx) in enumerate(parts):
        for k in idx:
            owner[k] = pi
    cuts = set()
    def doubled(letters):
        return len(letters) >= 2 and letters[0].lower() == letters[1].lower() and letters[0].lower() not in "aeiou"
    for k in starts[1:]:
        pi = owner[k]
        letters, idx = parts[pi]
        prev = owner.get(k - 1)
        if idx[0] != k:                        # e.g. x = /ks/ split across syllables: cut after it
            cuts.add((pi, 1) if doubled(letters) else (pi + 1, 0))     # vac·cine
        elif doubled(letters):
            cuts.add((pi, 1))                  # com·mo, im·pres·sion: split a double letter in the middle
        elif prev is not None and doubled(parts[prev][0]) and parts[prev][1][-1] == k - 1 and len(parts[prev][1]) == 1 \
                and letters[0].lower() in "aeiouy":
            cuts.add((prev, 1))                # lug·gage, pro·fes·sor
        else:
            cuts.add((pi, 0))
    syl, out_parts = "", []
    for pi, (letters, idx) in enumerate(parts):
        for c in range(len(letters) + 1):
            if (pi, c) in cuts and syl and not syl.endswith("·"):
                syl += "·"
            if c < len(letters):
                syl += letters[c]
        sound = "".join(ipa_of(phones[k]) for k in idx)
        low = letters.lower()
        flag = ""
        if not idx:
            nxt_vowel_long = False
            if low == "e" and pi == len(parts) - 1 and pi >= 2:
                prev_v = parts[pi - 2][1]
                nxt_vowel_long = bool(prev_v) and re.sub(r"\d", "", phones[prev_v[-1]]) in {"EY", "IY", "AY", "OW", "UW"}
            flag = "e" if nxt_vowel_long else "s"
        elif len(low) == 2 and low[0] == low[1] and low[0] not in "aeiou":
            flag = "d"
        out_parts.append([letters, sound, flag])
    return ipa, syl, out_parts, cost


IPA_SEQ = {k: ["".join(ipa_of(p + ("1" if p in ("AH", "ER") else "")) for p in seq) for seq in v] for k, v in G.items()}


def known(letters, sound, flag):
    """True when a letter group makes one of its usual sounds (or is a usual silent letter)."""
    low = letters.lower()
    if not sound:
        return low in SILENT
    norm = sound.replace("ə", "ʌ").replace("ɚ", "ɝ")
    return norm in IPA_SEQ.get(low, [])


def rules_for_app():
    """The pronunciation rules as plain data, so the app can do the same for words people add."""
    return {
        "G": {k: [" ".join(seq) for seq in v] for k, v in G.items()}, "SILENT": SILENT, "FALLBACK": FALLBACK,
        "ONSETS": [" ".join(o) for o in sorted(ONSETS)], "IPA": IPA, "VOWELS": sorted(VOWELS),
        "OVERRIDES": OVERRIDES, "COMPOUNDS": COMPOUNDS, "UN": UN, "COMPOUND_WORDS": COMPOUND_WORDS,
        "SYL_OVERRIDES": SYL_OVERRIDES, "LETTER_NAMES": LETTER_NAMES,
    }


def load_dict(path):
    d = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line or line.startswith(";"):
            continue
        w, *p = line.split()
        d.setdefault(re.sub(r"\(\d+\)$", "", w), p)  # first pronunciation = most common
    return d


def main():
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else SUBSET
    cmu = load_dict(src)
    for w, p in OVERRIDES.items():
        cmu[w] = p.split()
    needed, problems, review = {}, [], []
    for v in vocab:
        if v["cat"] == "custom":
            continue
        tokens = [t for t in re.split(r"(\s+|-)", v["word"]) if t and not t.isspace() and t != "-"]
        ipas, syls, parts, total = [], [], [], 0.0
        for t in tokens:
            key = t.lower().strip("'")
            if key in cmu:
                phones = cmu[key]
            elif key in COMPOUNDS:
                phones = []
                for n_piece, piece in enumerate(COMPOUNDS[key]):
                    ph = UN.split() if piece == "un" else cmu[piece]
                    if n_piece and piece != "un" and COMPOUNDS[key][0] != "un":
                        ph = [x.replace("1", "2") for x in ph]
                    phones += ph
                    if piece != "un":
                        needed[piece] = cmu[piece]
            else:
                problems.append(f"no pronunciation for '{t}' in '{v['word']}'")
                continue
            needed[key] = phones
            if key in LETTER_NAMES:
                p = LETTER_NAMES[key]
                ipa, syl, cost = "ˌtiˈvi", "T·V", 0.0
            else:
                ipa, syl, p, cost = compound_entry(t, phones, cmu)
                for piece in (split_compound(t, phones, cmu) or []):
                    needed[piece[0].lower()] = cmu[piece[0].lower()]
            ipas.append(ipa); syls.append(syl); total += cost
            if parts:
                parts.append([" ", "", " "])
            parts += p
            if "".join(x[0] for x in p) != t:
                problems.append(f"breakdown of '{t}' does not spell the word")
        if tokens:
            v["ipa"] = "/" + " ".join(ipas) + "/"
            v["syl"] = " ".join(SYL_OVERRIDES.get(t.lower(), sy) for t, sy in zip(tokens, syls))
            v["parts"] = parts
            odd = [f"{a}={b or '∅'}" for a, b, f in parts if f not in (" ",) and not known(a, b, f)]
            if odd:
                review.append((len(odd), v["word"], v["ipa"], " ".join(f"{a}={b or '∅'}" for a, b, f in parts if f != " ")))
    if problems:
        raise SystemExit("\n".join(problems))
    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=1), encoding="utf-8")
    if src != SUBSET:
        lic = (here.parent / "dev" / "cmudict-LICENSE.txt")
        header = ";;; Subset of the CMU Pronouncing Dictionary used by this app (first pronunciation of each word).\n" \
                 ";;; Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved. BSD-style licence: see cmudict-LICENSE.txt\n"
        body = "".join(f"{w} {' '.join(p)}\n" for w, p in sorted(needed.items()) if p)
        SUBSET.write_text(header + body, encoding="utf-8")
    review.sort(reverse=True)
    print(f"Pronunciation added to {sum(1 for v in vocab if 'ipa' in v)} words.")
    print(f"Unusual letter-sound matches ({len(review)} words, check these):")
    for r in review:
        print(f"  {r[1]:28} {r[2]:28} {r[3]}")


if __name__ == "__main__":
    main()
