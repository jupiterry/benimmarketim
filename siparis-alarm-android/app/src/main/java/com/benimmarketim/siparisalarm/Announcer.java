package com.benimmarketim.siparisalarm;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.util.Locale;

/**
 * Siparişi Türkçe sesli okur (telefonun kendi metin okuma motoru; internet gerekmez).
 * Alarm kanalından konuşur, sessiz modda da duyulur. Türkçe ses paketi yoksa sessizce devre dışı kalır.
 */
final class Announcer {
    private static final String TAG = "Announcer";

    interface Done {
        void onDone();
    }

    enum State { NOT_STARTED, STARTING, READY, NO_TURKISH, FAILED }

    private static Announcer instance;

    private final Context context;
    private TextToSpeech tts;
    private volatile State state = State.NOT_STARTED;
    private volatile Done pending;

    private Announcer(Context context) {
        this.context = context.getApplicationContext();
    }

    static synchronized Announcer get(Context context) {
        if (instance == null) instance = new Announcer(context);
        return instance;
    }

    State state() {
        return state;
    }

    /** Motoru önceden hazırlar (ilk okuma gecikmesin). */
    synchronized void warmUp() {
        if (tts != null) return;
        state = State.STARTING;
        tts = new TextToSpeech(context, status -> {
            if (status != TextToSpeech.SUCCESS) {
                state = State.FAILED;
                return;
            }
            int result = tts.setLanguage(new Locale("tr", "TR"));
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                state = State.NO_TURKISH;
                return;
            }
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            tts.setSpeechRate(0.95f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                }

                @Override
                public void onDone(String id) {
                    finish();
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onError(String id) {
                    finish();
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    finish();
                }
            });
            state = State.READY;
        });
    }

    private void finish() {
        Done done = pending;
        pending = null;
        if (done != null) done.onDone();
    }

    /** Okur; bitince (ya da okunamazsa hemen) `done` çağrılır. */
    synchronized boolean speak(String text, Done done) {
        if (state != State.READY || tts == null || text == null) return false;
        pending = done;
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "siparis");
        if (result != TextToSpeech.SUCCESS) {
            Log.w(TAG, "Okunamadı");
            pending = null;
            return false;
        }
        return true;
    }

    synchronized void stop() {
        pending = null;
        if (tts != null && state == State.READY) tts.stop();
    }
}
