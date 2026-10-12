# IELTS Spelling Dictation

You hear a word, type it, and press **Enter**, all in one window. There's nothing to install, no account, no API key and no server.

## What's in this folder

| File | What it is |
|---|---|
| `IELTS-Spelling-Dictation.html` | The whole app (the 80 built-in words are inside it) |
| `Start IELTS Dictation.bat` | Double-click to open the app in Microsoft Edge, or Chrome if Edge isn't found |
| `sample-vocabulary.csv` | Example file showing the format for importing your own words |
| `README.md` | This file |

## Start it on Windows

1. Unzip `IELTS-Spelling-Dictation.zip` to any folder, for example `Documents\IELTS-Spelling-Dictation`. Don't run it from inside the ZIP.
2. Double-click **`Start IELTS Dictation.bat`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**. The file only opens the HTML page in your browser; you can open it in Notepad to check.
   - **Or** skip the .bat: right-click `IELTS-Spelling-Dictation.html` → **Open with → Microsoft Edge** (or Google Chrome).
3. In the **Audio** box, check that it says *Voice ready*, click **🔊 Test voice**, and adjust rate and volume.
4. Click **▶ Start**. From then on you only need the keyboard.

Use **Microsoft Edge** or **Google Chrome**. Both use the voices built into Windows.

## Audio setup

- Windows 10 and 11 normally include local US English voices (**Microsoft David**, **Zira**, **Mark**). In the voice list these are marked **"local, works offline"**, and one of them is chosen by default.
- Edge also lists **"online, needs internet"** voices (for example *Aria Online (Natural)*). They sound more natural, but the word being spoken is sent to Microsoft's speech service. Nothing else is sent: not your vocabulary list, answers or results. Choose a *local* voice if you want to stay fully offline.
- **No US English voice listed?** Open **Settings → Time & language → Speech → Manage voices → Add voices**, add **English (United States)**, then close and reopen the browser and click **Look for voices again**.
- If no English voice exists, the app shows an error and won't start. It never shows the words on screen in place of audio.
- **Silent but no error?** Check the Windows volume mixer, the output device and the app's own volume slider.

## How a session works

1. Choose a mode (Mixed, Personal spelling priorities, Listening, Writing Task 1, Writing Task 2, Previously missed words) and the number of words. The default is 10.
2. Each word is read twice with a short pause. It is never shown or spelled before you answer.
3. Type it and press **Enter**. Capital letters and extra spaces are ignored. Wrong letters and endings are not.
4. **Correct:** you see a ✓ and the next word starts automatically (you can switch this off; then press Enter).
5. **Incorrect:** you see your answer and the correct spelling. Differences are marked with colour plus symbols (≠ wrong letter, ^ missing letter, + extra letter) and listed in words. Type the correct spelling and press Enter to continue. The word **still counts as incorrect**.
6. At the end you get your score (first answers only). Press **Enter** to retest just the words you missed. The retest has its own separate score.

The **Mixed** session fills about 60% of the words from your previously missed words and personal spelling priorities, and the rest from the other categories. The order is random, and no word repeats within a session.

A missed word leaves the "Previously missed words" list after you spell it right on the first try in **two** later sessions.

Two sound-alike words get a short spoken meaning after the two readings: *principle* ("as in, a basic rule or belief", so you don't write *principal*) and *peak*. You can switch this off in Audio settings.

## Keyboard shortcuts

| Key | Action |
|---|---|
| **Enter** | Submit answer / submit correction / next word / start retest / resume |
| **Alt + R** | Repeat the word (any speech already playing stops first, so presses never overlap or queue) |
| **Alt + S** | Repeat the word slowly |
| **Esc** or **Alt + P** | Pause / resume (your place and anything you typed are kept) |
| **Tab** | Move between buttons and settings |

Switching to another tab during a session pauses it. If you close the browser mid-session, the Practice screen offers to resume it next time.

## Your vocabulary

The 80 words from *IELTS Essential Spelling and Vocabulary* are built in:

- **Personal spelling priorities:** 15 words, from the "Correct spelling" column
- **Listening:** 25 words, from the "Correct spelling" column
- **Writing Task 1:** 20 words or phrases, from the "Word or phrase" column
- **Writing Task 2:** 20 words, from the "Word" column

"Your earlier spelling", headings and examples are never used as answers. The memory hints, topics and examples are shown *after* you answer.

In the **Vocabulary** tab you can add, edit and delete words, import a file, export the list to CSV, or restore the built-in list. The word list stays hidden until you click **Show word list**.

**Import format**

- **CSV:** `word,category,group,hint,example`. The header row is optional. Category can be `personal`, `listening`, `task1`, `task2` or `custom`; anything else goes into the category chosen next to the import button. See `sample-vocabulary.csv`.
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

There's no account, no tracking and no network requests from the app itself. The only possible outside connection is when you pick an *online* voice: the browser then sends the word being spoken to Microsoft's (Edge) or Google's (Chrome) speech service.
