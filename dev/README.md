# Developer notes (not needed to use the app)

- `extract_vocab.py`: reads the IELTS .docx and writes `vocab.json` using only the answer columns
  (fails if an "earlier spelling" or a UK spelling would become an answer).
  `python -I dev/extract_vocab.py "IELTS_Essential_Spelling_and_Vocabulary.docx" dev/vocab.json`
- `build_listening_hf.py`: cleans `listening_hf_source.txt` (the "378 High Frequency Words in IELTS Listening"
  list) into US-spelled, de-duplicated entries and appends them to `vocab.json`. Run it after `extract_vocab.py`.
- `build.py`: injects `vocab.json` into `IELTS-Spelling-Dictation/IELTS-Spelling-Dictation.html`.
  `python -I dev/build.py`
- `tests/e2e.test.mjs`: 16 end-to-end tests in headless Chromium (Playwright) against the real page.
  `tests/mock-speech.js` simulates the Web Speech API (late-loading voices, queueing, cancel) so the
  timing and overlap rules can be checked; the "no voices" test uses real Chromium with no speech engine.
  `node dev/tests/e2e.test.mjs`
