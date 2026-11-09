# IELTS Spelling Dictation for Android

The Android app shows the same single-file app (`../ielts-spelling-dictation/IELTS-Spelling-Dictation.html`) full-screen
and adds what a phone app needs. It is copied into the APK as `assets/index.html` at build time, so there is only one
copy of the app to maintain.

## What the Android shell adds (`MainActivity.java`)

| Feature | How |
|---|---|
| Voices | Android's own text-to-speech (usually *Speech Services by Google*), so every installed voice can be used, including 👩 woman / 👨 man voices. The page replaces the browser's `speechSynthesis` with these voices when `window.AndroidApp` exists. |
| Back button | Closes the Add/Edit window, pauses a running session, or returns to Practice; otherwise the app goes to the background. |
| Leaving the app | Home button or a phone call pauses the session and stops the voice. |
| Export / Import | Export opens Android's "Save as" screen; Import opens the file picker. |
| Other | A short vibration after a wrong answer; status-bar colors follow the light/dark theme; web links open in the browser. |

Bridge methods (JavaScript `window.AndroidApp`): `ttsVoices()`, `ttsSpeak(id, text, rate, volume, voiceId)`, `ttsStop()`,
`openTtsSettings()`, `vibrate(ms)`, `saveFile(name, mime, text)`, `setSystemBars(dark)`, `version()`.
Speech progress comes back through `window.__ttsEvent(id, "start" | "end" | "error")`.

## Building

Needs JDK 17+ and the Android SDK (platform 35). Then:

```bash
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleRelease
```

The APK is written to `app/build/outputs/apk/release/app-release.apk`.

### Signing key

Release builds are signed with `keystore/ielts-dictation.jks`; its passwords are in `keystore/keystore.properties`
(`storePassword=…`, `keyAlias=ielts`, `keyPassword=…`). **Both files are kept out of this repository on purpose.**
Keep a copy safe: an update installs over the existing app (keeping the progress) only when it is signed with the
same key. Without the key, `./gradlew assembleDebug` still builds a test version.

## Version

`versionName` in `app/build.gradle` matches the web app's version; raise `versionCode` by 1 for every new APK.
