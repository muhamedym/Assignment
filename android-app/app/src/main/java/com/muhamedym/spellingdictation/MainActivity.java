package com.muhamedym.spellingdictation;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * Spelling Dictation for IELTS Practice, for Android.
 *
 * The app itself is the same single HTML file as the Windows version (assets/index.html). This screen shows it
 * full-screen and adds what a phone app needs: the phone's own text-to-speech (so a woman's or a man's voice can be
 * chosen), saving and opening backup files, the Back button, a short vibration, and matching status-bar colors.
 * The page talks to this class through the JavaScript object "AndroidApp".
 */
public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/index.html";
    private static final int REQ_OPEN_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSaveText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        web.setBackgroundColor(isNight() ? 0xFF0D1117 : 0xFFF2F4F8);
        root = new FrameLayout(this);
        root.setBackgroundColor(isNight() ? 0xFF161B24 : 0xFFFFFFFF); // shows behind the status and navigation bars
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        fitAroundSystemBars();
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+: the Back button and the back gesture come here (predictive back).
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // progress, settings and vocabulary are kept in localStorage
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme) || "mailto".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u)); // web links open in the browser
                    } catch (ActivityNotFoundException ignored) {
                    }
                    return true;
                }
                return false;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // "Import" buttons (<input type="file">): let the person pick a backup or word list.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose a file"), REQ_OPEN_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { sendSpeech(id, "start"); }
                    @Override public void onDone(String id) { sendSpeech(id, "end"); }
                    @Override @SuppressWarnings("deprecation") public void onError(String id) { sendSpeech(id, "error"); }
                    @Override public void onError(String id, int code) { sendSpeech(id, "error"); }
                    @Override public void onStop(String id, boolean interrupted) { sendSpeech(id, "end"); }
                });
            }
            runJs("window.__androidTtsReady && window.__androidTtsReady(" + ttsReady + ")");
        });

        web.loadUrl(START_URL);
    }

    /**
     * Android 15 and 16 always draw apps behind the status bar, the navigation bar and the keyboard. The page is
     * kept clear of them with padding (and made shorter while the keyboard is open, so the answer box stays visible).
     */
    @SuppressWarnings("deprecation")
    private void fitAroundSystemBars() {
        if (Build.VERSION.SDK_INT < 30) return; // older Android: the theme and adjustResize do this
        Window w = getWindow();
        w.setDecorFitsSystemWindows(false);
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(0x00000000);
            w.setNavigationBarColor(0x00000000);
        }
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsets.CONSUMED;
        });
        root.requestApplyInsets();
    }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private void runJs(String code) {
        main.post(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    private void sendSpeech(String id, String type) {
        runJs("window.__ttsEvent && window.__ttsEvent(" + JSONObject.quote(id) + ",'" + type + "')");
    }

    private void toast(String text) {
        main.post(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    /** The status and navigation bars follow the app's light or dark theme. */
    @SuppressWarnings("deprecation")
    private void applySystemBars(boolean dark) {
        Window w = getWindow();
        int bar = dark ? 0xFF161B24 : 0xFFFFFFFF;
        root.setBackgroundColor(bar);
        if (Build.VERSION.SDK_INT < 30) {
            w.setStatusBarColor(bar);
            if (Build.VERSION.SDK_INT >= 27) w.setNavigationBarColor(bar);
        }
        web.setBackgroundColor(dark ? 0xFF0D1117 : 0xFFF2F4F8);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        } else {
            View d = w.getDecorView();
            int flags = d.getSystemUiVisibility();
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            d.setSystemUiVisibility(dark ? (flags & ~light) : (flags | light));
        }
    }

    private void startSave(String name, String mime, String text) {
        pendingSaveText = text;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE_FILE);
        } catch (ActivityNotFoundException e) {
            pendingSaveText = null;
            toast("This phone can't save files from the app.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (requestCode == REQ_OPEN_FILE) {
            if (fileCallback != null) fileCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            fileCallback = null;
        } else if (requestCode == REQ_SAVE_FILE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (uri == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(text.getBytes(StandardCharsets.UTF_8));
                toast("Saved ✓");
            } catch (Exception e) {
                toast("The file couldn't be saved.");
            }
        }
    }

    /** Back: close the open window, leave a screen, or pause the session first; otherwise the app goes to the background. */
    /** Android 7-12: the Back button arrives as a key (Android 13+ uses the callback registered in onCreate). */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (Build.VERSION.SDK_INT < 33 && event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) handleBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void handleBack() {
        if (web == null) return;
        web.evaluateJavascript("(window.__androidBack && window.__androidBack()) ? 'yes' : 'no'", value -> {
            if (value == null || !value.contains("yes")) moveTaskToBack(true);
        });
    }

    @Override
    protected void onPause() {
        // Leaving the app (home button, a call…) pauses the session and stops the voice.
        web.evaluateJavascript("window.__androidPause && window.__androidPause()", null);
        if (ttsReady) tts.stop();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Called from the page as window.AndroidApp.* (on a background thread). */
    private class Bridge {
        @JavascriptInterface
        public boolean ttsReady() {
            return ttsReady;
        }

        /** The phone's English voices: [{id, lang, network, quality, notInstalled}]. */
        @JavascriptInterface
        public String ttsVoices() {
            JSONArray out = new JSONArray();
            if (!ttsReady) return out.toString();
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        Locale l = v.getLocale();
                        if (l == null || !"en".equals(l.getLanguage())) continue;
                        Set<String> f = v.getFeatures();
                        JSONObject o = new JSONObject();
                        o.put("id", v.getName());
                        o.put("lang", l.toLanguageTag());
                        o.put("network", v.isNetworkConnectionRequired());
                        o.put("quality", v.getQuality());
                        o.put("notInstalled", f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
                        out.put(o);
                    }
                }
            } catch (Exception ignored) {
            }
            return out.toString();
        }

        /** Speak text with a voice (by id); returns 0 when it was queued. Progress comes back through window.__ttsEvent. */
        @JavascriptInterface
        public int ttsSpeak(String id, String text, float rate, float volume, String voiceId) {
            if (!ttsReady) return -9;
            try {
                if (voiceId != null && !voiceId.isEmpty()) {
                    Voice cur = tts.getVoice();
                    if (cur == null || !voiceId.equals(cur.getName())) {
                        Set<Voice> voices = tts.getVoices();
                        if (voices != null) {
                            for (Voice v : voices) {
                                if (voiceId.equals(v.getName())) {
                                    tts.setVoice(v);
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    tts.setLanguage(Locale.US);
                }
                tts.setSpeechRate(rate > 0 ? rate : 1f);
                tts.setPitch(1f);
                Bundle p = new Bundle();
                p.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
                return tts.speak(text, TextToSpeech.QUEUE_FLUSH, p, id);
            } catch (Exception e) {
                return -1;
            }
        }

        @JavascriptInterface
        public void ttsStop() {
            if (ttsReady) tts.stop();
        }

        /** Opens Android's text-to-speech settings (to install or change voices). */
        @JavascriptInterface
        public void openTtsSettings() {
            main.post(() -> {
                try {
                    startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_SETTINGS));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                int d = Math.max(10, Math.min(ms, 400));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(d);
            } catch (Exception ignored) {
            }
        }

        /** "Export" buttons: the person chooses where to save the file. */
        @JavascriptInterface
        public void saveFile(String name, String mime, String text) {
            main.post(() -> startSave(name, mime, text));
        }

        @JavascriptInterface
        public void setSystemBars(boolean dark) {
            main.post(() -> applySystemBars(dark));
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
