# Publishing "Spelling Dictation for IELTS Practice" on Google Play

There are four stages. Steps marked **⚠** are permanent or protect your ownership, so read those twice.

| Stage | Where | Time |
|---|---|---|
| A. Put the app online | Netlify (free) | 15 minutes |
| B. Make the Android package | PWABuilder (free) | 15 minutes |
| C. Set up the app in Play Console | Google Play Console | 1–2 hours |
| D. Closed test, then go public | Play Console | about 3 weeks (mostly waiting) |

---

## A. Put the app online (Netlify)

The Android app opens this website, so it must be online first. After the first visit it works offline.

1. The privacy policy needs no editing. It refers people to the contact email on your Google Play page.
2. Go to **netlify.com** → **Sign up** (you can use your Google account). It's free.
3. Open **app.netlify.com/drop** and **drag the whole `site` folder** onto the page. In a few seconds you get an address like `https://jolly-tiger-123.netlify.app`.
4. Give it a proper name: **Site configuration → Change site name** → e.g. `spelling-dictation-ielts`.
   Your address becomes **`https://spelling-dictation-ielts.netlify.app`**. Write it down; you'll need it below.
5. Test it on your Android phone: open the address in **Chrome**, try a few words, then **⋮ menu → Install app**. If it installs and works, you're ready for stage B.

> To update the app later, go to **Netlify → your site → Deploys** and drag the new `site` folder there. Users get the update automatically, with no new Play Store upload needed.

---

## B. Make the Android package (PWABuilder)

1. Go to **pwabuilder.com**, paste your Netlify address, and click **Start**.
2. Click **Package for stores → Android → Generate package** and fill in:

| Field | Value |
|---|---|
| **Package ID ⚠** | `com.mohammedmohammed.spellingdictation`. This can **never be changed** after publishing. |
| App name | Spelling Dictation for IELTS Practice |
| Launcher name | Spelling Dictation |
| App version / version code | 1.0.0 / 1 |
| Signing key | **Create new**. Enter your full name and, as organization, your name again. Choose strong passwords and **write them down**. |

3. Click **Download**. The ZIP contains:

| File | What it's for |
|---|---|
| `….aab` | **Upload this to Google Play** |
| `….apk` | Install on your own phone to test |
| `signing.keystore` + `signing-key-info.txt` ⚠ | **Your ownership key.** Without it you can never update the app. Keep two copies (e.g. USB drive + OneDrive or Google Drive). Never send it to anyone. |
| `assetlinks.json` | Proves the website and the app belong together |

4. **Link the website to the app:** copy `assetlinks.json` from the ZIP into your `site` folder (replace the one there) and drag the folder to Netlify again (Deploys).
   *If you skip this, the app shows a browser address bar at the top.*

---

## C. Set up the app in Play Console

Open **play.google.com/console**.

1. **Create app**
   - App name: **Spelling Dictation for IELTS** (Google allows 30 characters; see `STORE-LISTING.md` for other options)
   - Default language: English (United States)
   - App, Free. Tick the declarations, then click **Create app**.
2. **Dashboard → "Set up your app"**: work through each item using the answers in **`STORE-LISTING.md`**:
   - privacy policy: `https://YOUR-SITE.netlify.app/privacy.html`
   - app access, ads, content rating, target audience, data safety
   - store listing: texts, icon, feature graphic, screenshots
3. **⚠ Add Google's key to `assetlinks.json` too.** Google re-signs your app with its own key. Go to **Test and release → App integrity → App signing** and copy the **SHA-256 certificate fingerprint**. Open `site/assetlinks.json` in Notepad: inside `"sha256_cert_fingerprints": [ … ]` there's already one fingerprint in quotes. Add a comma and Google's fingerprint in quotes, like this:
   ```
   "sha256_cert_fingerprints": ["AA:BB:…(from PWABuilder)", "CC:DD:…(from Play Console)"]
   ```
   Save, and drag the `site` folder to Netlify again.

---

## D. Closed test, then go public

New personal developer accounts must run a **closed test** before they can publish publicly. When this guide was written, the rule was **at least 12 testers, opted in for 14 days in a row**. Check the current numbers on your Dashboard.

1. **Test and release → Testing → Closed testing → Create track** (or use "Alpha").
2. **Create release → upload the `.aab` file** → name it `1.0.0` → Release notes: "First release." → **Save → Review → Start rollout**.
3. **Testers:** create an email list with 12–15 Gmail addresses (friends, colleagues, classmates). Copy the **opt-in link** and send it to them. Each tester must:
   - open the link and tap **Become a tester**
   - install the app from Google Play
   - keep it installed for 14 days and open it now and then
4. After 14 days, go to **Dashboard → Apply for production** and answer the short questions (how you tested, what feedback you got).
5. When approved: **Production → Create release → upload the same `.aab` → Start rollout**. Google's review usually takes a few days.

---

## Keeping ownership: checklist ⚠

- [ ] The Play developer account is in **your** name. It appears as the developer on the store.
- [ ] `signing.keystore` and its passwords are backed up in **two** safe places.
- [ ] The **Package ID** is written down (it's permanent).
- [ ] The app shows *"Designed by Mohammed Mohammed · © 2026 All rights reserved"* (in the footer and Help → About). This is already done.
- [ ] Make your GitHub repository **private**: github.com → the repository → **Settings → General → Danger Zone → Change visibility → Private**.
- [ ] Optional: register the copyright of your design or content in your country for extra proof.

## Before going public: two content checks

1. **Trademark:** the store title and description say "for IELTS" and include a "not affiliated" sentence. Don't use the official IELTS logo or colors.
2. **The "378 High Frequency Words in IELTS Listening" section** came from a list you found. Single words can't be owned, but a copied list and its title can be. For the public app, consider renaming the section (e.g. "High-frequency Listening words") or confirm the source allows reuse.

## Updating the app later

- **Changing words or the design:** update the `site` folder and drag it to Netlify. Everyone gets it automatically.
- **New Play upload (rarely needed):** only if you change the name, icon or package settings. Generate a new package in PWABuilder with the **same Package ID** and **existing signing key** ("Use mine"), and a higher version code (2, 3…).
