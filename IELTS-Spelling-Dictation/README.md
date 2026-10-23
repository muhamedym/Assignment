# IELTS Spelling Dictation

You hear a word, type it, and press **Enter**, all in one window. There's nothing to install, no account, no API key and no server.

## What's in this folder

| File | What it is |
|---|---|
| `IELTS-Spelling-Dictation.html` | The whole app (all 547 built-in words are inside it) |
| `Start IELTS Dictation.bat` | Optional launcher for Edge/Chrome (blocked when Smart App Control is on; open the .html instead) |
| `sample-vocabulary.csv` | Example file showing the format for importing your own words |
| `README.md` | This file |

## Practice screen

The top of the Practice screen shows your word count, how many missed words are waiting and your last score, with two big buttons: **▶ Start** (using the choices below) and **🔁 Review my missed words**.

## Start it on Windows

1. Unzip `IELTS-Spelling-Dictation.zip` to any folder, for example `Documents\IELTS-Spelling-Dictation`. Don't run it from inside the ZIP.
2. Double-click **`IELTS-Spelling-Dictation.html`**. It opens in your browser. Edge or Chrome works best: if it opens elsewhere, right-click it → **Open with → Microsoft Edge** or **Google Chrome**.
   - `Start IELTS Dictation.bat` is optional. **Windows Smart App Control blocks it** because it came from the internet. That's expected: click **Okay** and open the .html file instead. Don't turn Smart App Control off for this.
3. In the **Audio** box, check that it says *Voice ready*, click **🔊 Test voice**, and adjust rate and volume.
4. Click **▶ Start**. From then on you only need the keyboard.

Use **Microsoft Edge** or **Google Chrome**. Both use the voices built into Windows.

## Audio setup

**For the clearest pronunciation, use Microsoft Edge.** It offers Microsoft's "Natural" voices (for example *Aria* and *Jenny*), which sound far more human than the older built-in Windows voices. The app picks the clearest available US voice automatically; these are marked **★** in the voice list.

- The ★ Natural voices are **online**: they need internet, and the word or sentence being spoken is sent to Microsoft's speech service. Nothing else is sent: not your vocabulary list, answers or results.
- **If the online voice doesn't respond** (for example with no internet), the app switches automatically to a local Windows voice (**Microsoft David**, **Zira** or **Mark**, marked *"local, works offline"*) and says so on screen. The next time you open the app, it tries the clearer voice again.
- To stay fully offline, choose a *local* voice in the list. Your choice is remembered.
- Some words are pronounced with a small fix so the voice reads them correctly. For example, *resume* (the job document) is read as "résumé".
- **No US English voice listed?** Open **Settings → Time & language → Speech → Manage voices → Add voices**, add **English (United States)**, then close and reopen the browser and click **Look for voices again**.
- If no English voice exists, the app shows an error and won't start. It never shows the words on screen in place of audio.
- **Silent but no error?** Check the Windows volume mixer, the output device and the app's own volume slider.

## How a session works

1. Choose what to practice and the number of words (default 10):
   - Mixed vocabulary (personal + missed words first)
   - Personal spelling priorities
   - Listening vocabulary: all, or one part (Bookings, Dates, Numbers, Travel, Education…)
   - 378 High Frequency Words in IELTS Listening: all, or one topic (School, Daily Life, Business…)
   - Reading: all, or one topic (Science & Research, Environment & Nature, History & Archaeology, Health & Medicine, Technology & Innovation, Psychology & Behavior, Business & Economics, Society & Culture)
   - Academic Writing: Task 1 + Task 2 together, or just one task
   - Previously missed words

   When a category has parts, a **Part** menu appears under the list.
2. Each word is read twice with a short pause. It is never shown or spelled before you answer.
3. Type it and press **Enter**, or click the **Submit** button. Capital letters and extra spaces are ignored, and hyphens are optional because you can't hear them (*full-time*, *full time* and *fulltime* are all accepted). Wrong letters and endings are not.
4. **Correct:** you see a ✓, and the next word starts after about 4 seconds so you can read the word information. Press Enter to go on sooner, or switch auto-advance off. Pressing *Say a sentence* during this time stops the auto-advance.
5. Unsure what you heard? Press **Alt + X** (or **💬 Say a sentence**) to hear the word in a full example sentence. The sentence isn't shown until you answer.
6. **After every answer**, right or wrong, you see the word with its **meaning**, **part of speech** (noun, verb, adjective…), **word family** (e.g. *decide → decision, decisive*), the **example sentence** and its **category**.
7. **Incorrect:** you see your answer and the correct spelling. Differences are marked with colour plus symbols (≠ wrong letter, ^ missing letter, + extra letter) and listed in words. Type the correct spelling and press Enter to continue. The word **still counts as incorrect**.
8. At the end you get your score (first answers only). Press **Enter** to retest just the words you missed. The retest has its own separate score.

The **Mixed** session fills about 60% of the words from your previously missed words and personal spelling priorities, and the rest from the other categories. The order is random, and no word repeats within a session.

A missed word leaves the "Previously missed words" list after you spell it right on the first try in **two** later sessions.

Sound-alike words get a short spoken meaning after the two readings, for example *principle* ("as in, a basic rule or belief", so you don't write *principal*), *stationery* ("as in, paper and pens") and *dessert*. You can switch this off in Audio settings.

## Pronunciation help (IPA, syllables, silent letters)

After every answer, the word panel shows:
- **American pronunciation in IPA**, e.g. *accommodation* /əˌkɑməˈdeɪʃən/, with a **🔊 Hear** button.
- **Syllables:** ac·com·mo·da·tion (5 syllables).
- **Letters and sounds:** each letter group with the sound it makes (cc → /k/, ti → /ʃ/).
- **Silent letters** crossed out in red (the **p** in *receipt*, the **n** in *autumn*, the **d** in *Wednesday*), and **double letters** that make one sound (the **cc** and **mm** in *accommodation*).

The **Sounds** tab is a reference page:
- what every American IPA symbol sounds like, with a key word
- how each sound is spelled in your own words (/ʃ/ = sh, ti, ci, ss…)
- every word with a silent letter
- every word with a double letter
- a look-up box for any word

Optional: tick **"Show the IPA pronunciation as a hint while I listen"** (Practice → Session) to see the IPA before you answer. It shows sounds, not spelling.

Pronunciations are based on the CMU Pronouncing Dictionary (American English, © Carnegie Mellon University, BSD-style licence). The full dictionary (about 126,000 words) is built into the app, so words you add get their pronunciation automatically, offline. For a word it doesn't know, you can type the IPA yourself.

## Keyboard shortcuts

| Key | Action |
|---|---|
| **Enter** or the **Submit** button | Submit answer / submit correction / next word / start retest / resume |
| **Alt + R** | Repeat the word (any speech already playing stops first, so presses never overlap or queue) |
| **Alt + S** | Repeat the word slowly |
| **Alt + X** | Say an example sentence that uses the word |
| **Esc** or **Alt + P** | Pause / resume (your place and anything you typed are kept) |
| **Tab** | Move between buttons and settings |

Switching to another tab during a session pauses it. If you close the browser mid-session, the Practice screen offers to resume it next time.

## Your vocabulary

547 words are built in. The first 80 come from *IELTS Essential Spelling and Vocabulary*:

- **Personal spelling priorities:** 15 words, from the "Correct spelling" column
- **Listening:** 25 words, from the "Correct spelling" column
- **Writing Task 1:** 20 words or phrases, from the "Word or phrase" column
- **Writing Task 2:** 20 words, from the "Word" column

Plus **378 High Frequency Words in IELTS Listening:** 369 words and phrases, grouped by topic (School › Library, Daily Life › Shopping, and so on). The list has 364 lines. To make each answer one clear US spelling:
- "A/B" entries became separate words (*waiter*, *waitress*; *refrigerator*, *fridge*).
- UK spellings changed to US (*catalog*, *anesthetist*, *plow through*).
- "sb." became "someone" (*call on someone*).
- 7 words already in the app were skipped as duplicates.

After you answer, the feedback shows how the entry was originally written.

Plus **Reading**: 98 academic words written for this app in 8 IELTS Reading topics, each with a meaning, part of speech, word family and example sentence.

"Your earlier spelling", headings and examples are never used as answers. The memory hints, topics and examples are shown *after* you answer.

Every built-in word has a meaning, part of speech, word family and example sentence.

**Managing words (Vocabulary tab):**
1. Click a category card (Listening, Reading, Academic Writing…). Its words appear. They stay hidden until then, so you don't see answers by accident.
2. Use the subcategory buttons (e.g. *Dates*, *Health & Medicine*, *Task 2*) and the search box to narrow the list.
3. **＋ Add a word** opens a window. Type the word, choose the category and (optionally) a subcategory, then click **Save word**. Only the word is required.
4. **Empty boxes are filled in for you:**
   - **Offline:** American IPA, syllables, letter-to-sound breakdown and silent letters (from the built-in dictionary).
   - **Online:** meaning, part of speech, example sentence, word family and similar words. These come from free services: **dictionaryapi.dev**, **Wiktionary** (wiktionary.org) and **datamuse.com**. If neither dictionary has a short example, the app takes one sentence from a longer Wiktionary quotation, or a real sentence that uses the word from **Wikipedia** (wikipedia.org). Only the word itself is sent; your list, answers and results never are. No account or key is needed.
   - Filled-in boxes are **highlighted in blue**. Anything you type yourself is never replaced. Automatic details can be wrong or describe another meaning of the word, so check them.
   - **Spelling check:** if the word isn't in any dictionary (for example *doubtedly* instead of *undoubtedly*), the window warns you and suggests real words; click one to use it. Nothing is guessed for an unknown word, and you're asked to confirm before saving it. Suggestions also work offline, from the built-in dictionary.
   - Untick **Look up online** in the Add window to stay fully offline. The setting is remembered.
   - Imported words are filled in the same way, in the background. If you're offline, the list shows **✨ Fill them in** to try again later.
   - If no example is found anywhere, the Add window says so. **Say a sentence** then reads the meaning instead, or you can type your own example.
5. **🗑 Delete** removes a word at once, with an **Undo** button. **✎ Edit** opens the same window with the word's details.
6. **＋ My own words** lets anyone build their own list, with their own subcategories.
7. **Import, export or restore words** (at the bottom) imports a CSV/TXT file, exports everything to CSV, or restores the built-in list.

**Import format**

- **CSV:** `word,category,group,hint,example,context,pos,meaning,sentence,family,similar,ipa` (only `word` is required; empty columns are filled in automatically). The header row is optional. Category can be `personal`, `listening`, `hf` (high-frequency listening), `task1`, `task2` or `custom`; anything else goes into the category chosen next to the import button. See `sample-vocabulary.csv`.
- **TXT:** one word or phrase per line.
- Duplicates are skipped. Use US spelling.

## Where your progress is saved, and backups

Session history, missed words, settings and vocabulary changes are saved in the **browser's local storage** on this PC, inside your Windows user profile (for Edge: `%LocalAppData%\Microsoft\Edge\User Data\Default\Local Storage`). Nothing is uploaded.

- **Moving the app folder:** in Edge and Chrome your progress stays available, because the browser stores data for all local files together. (Tested in Chromium; export a backup first anyway.)
- **Switching browser, Windows user or PC:** the new browser starts empty, so move your data with Export/Import.
- **Clearing browsing data** ("Cookies and other site data") deletes progress. InPrivate/Incognito windows don't keep it.

**To back up:** **Progress → ⬇ Export progress** saves a `.json` file to your Downloads folder. Keep it on OneDrive or a USB drive.
**To restore or transfer:** **Progress → ⬆ Import and merge** adds the file's sessions to what's already there. **Import and replace** overwrites everything.

## Privacy

There's no account and no tracking. Your vocabulary list, answers and results are never sent anywhere. There are only two possible outside connections:
- **An *online* voice:** the browser sends the word or sentence being spoken to Microsoft's (Edge) or Google's (Chrome) speech service.
- **Look-up for words you add or import:** the word itself is sent to dictionaryapi.dev, wiktionary.org, wikipedia.org and datamuse.com to get its meaning, example and word family. Switch this off with **Look up online** in the Add window.
