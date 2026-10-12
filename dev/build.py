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
html_path.write_text(new, encoding="utf-8")
print(f"Injected {len(vocab)} words into {html_path.name}")
