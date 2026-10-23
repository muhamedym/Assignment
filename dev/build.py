"""Inject dev/vocab.json into the app's BUILTIN_VOCAB block.  Usage: python -I dev/build.py"""
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / "IELTS-Spelling-Dictation" / "IELTS-Spelling-Dictation.html"
vocab = json.loads((root / "dev" / "vocab.json").read_text(encoding="utf-8"))
html = html_path.read_text(encoding="utf-8")
blob = json.dumps(vocab, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
new, n = re.subn(r"/\*@@VOCAB@@\*/.*?/\*@@END@@\*/", lambda m: "/*@@VOCAB@@*/" + blob + "/*@@END@@*/", html, flags=re.S)
assert n == 1, "vocab marker not found"

# Pronunciation for words people add: the rules (same as dev/add_pronunciation.py) and the whole
# CMU dictionary, compactly encoded (one character per sound) and gzipped, unpacked in the browser.
import base64, gzip, sys
sys.path.insert(0, str(root / "dev"))
import add_pronunciation  # noqa: E402
rules = json.dumps(add_pronunciation.rules_for_app(), ensure_ascii=False, separators=(",", ":"))
new, n = re.subn(r"/\*@@PRONRULES@@\*/.*?/\*@@ENDRULES@@\*/", lambda m: "/*@@PRONRULES@@*/" + rules + "/*@@ENDRULES@@*/", new, flags=re.S)
assert n == 1, "pronunciation rules marker not found"
entries = []
for line in gzip.decompress((root / "dev" / "cmudict-full.txt.gz").read_bytes()).decode("utf-8").splitlines():
    if line and not line.startswith(";"):
        w, *p = line.split()
        entries.append((w, p))
codes = sorted({x for _, p in entries for x in p})
code_of = {c: chr(48 + i) for i, c in enumerate(codes)}
packed = ",".join(codes) + "\n" + "\n".join(w + " " + "".join(code_of[x] for x in p) for w, p in entries)
blob = base64.b64encode(gzip.compress(packed.encode("utf-8"), 9, mtime=0)).decode("ascii")
new, n = re.subn(r'(<script type="text/plain" id="cmuData">).*?(</script>)', lambda m: m.group(1) + blob + m.group(2), new, flags=re.S)
assert n == 1, "cmuData marker not found"
html_path.write_text(new, encoding="utf-8")
print(f"Injected {len(vocab)} words and a {len(entries)}-word pronunciation dictionary ({len(blob) // 1024} KB) into {html_path.name}")
