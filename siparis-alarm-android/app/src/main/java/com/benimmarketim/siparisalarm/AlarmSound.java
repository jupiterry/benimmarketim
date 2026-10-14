package com.benimmarketim.siparisalarm;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.util.Log;

/**
 * Onaylanana kadar susmayan alarm: telefonun zil sesi alarm kanalından (sessiz modda da duyulur)
 * döngüyle çalar, titreşim tekrarlanır. "Sesi en yükseğe çıkar" açıksa alarm ses seviyesi en yükseğe
 * çekilir ve kısılırsa birkaç saniyede bir yeniden yükseltilir; alarm bitince eski seviyeye döner.
 */
final class AlarmSound {
    private static final String TAG = "AlarmSound";
    static final String APP_SOUND = "app";
    private static final long VOLUME_ENFORCE_MS = 3000;
    private static final long[] VIBRATION = {0, 900, 500, 900, 1200};

    private static AlarmSound instance;

    private final Context context;
    private final AudioManager audio;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private Vibrator vibrator;
    private AudioFocusRequest focus;
    private int savedVolume = -1;
    private boolean active;
    private Torch torch;
    private String announcement;

    private static final long ANNOUNCE_FIRST_MS = 3500;
    private static final long ANNOUNCE_EVERY_MS = 20000;

    /** Zil sesini kısa süre durdurup siparişi okur, sonra zile devam eder. */
    private final Runnable announceLoop = new Runnable() {
        @Override
        public void run() {
            synchronized (AlarmSound.this) {
                if (!active || !Prefs.speak(context) || announcement == null) return;
                Announcer announcer = Announcer.get(context);
                Announcer.State state = announcer.state();
                if (state == Announcer.State.NO_TURKISH || state == Announcer.State.FAILED) return;
                if (state != Announcer.State.READY) {
                    announcer.warmUp();
                    handler.postDelayed(this, 2000);
                    return;
                }
                pausePlayer();
                if (!announcer.speak(announcement, () -> handler.post(AlarmSound.this::resumeAfterSpeech))) {
                    resumeAfterSpeech();
                }
            }
        }
    };

    private final Runnable volumeEnforcer = new Runnable() {
        @Override
        public void run() {
            synchronized (AlarmSound.this) {
                if (!active) return;
                if (Prefs.maxVolume(context)) {
                    if (savedVolume < 0) savedVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
                    raiseVolume();
                }
            }
            handler.postDelayed(this, VOLUME_ENFORCE_MS);
        }
    };

    private AlarmSound(Context context) {
        this.context = context.getApplicationContext();
        this.audio = (AudioManager) this.context.getSystemService(Context.AUDIO_SERVICE);
    }

    static synchronized AlarmSound get(Context context) {
        if (instance == null) instance = new AlarmSound(context);
        return instance;
    }

    private static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    synchronized boolean isPlaying() {
        return active;
    }

    synchronized void start() {
        if (active) return;
        active = true;
        if (Prefs.maxVolume(context)) {
            if (savedVolume < 0) savedVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            raiseVolume();
        }
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(alarmAttributes())
                .build();
        try {
            audio.requestAudioFocus(focus);
        } catch (Exception e) {
            Log.w(TAG, "Ses odağı alınamadı", e);
        }

        player = createPlayer(chosenUri(context));
        if (player == null) player = createPlayer(appSoundUri(context));
        if (player == null) Log.e(TAG, "Alarm sesi çalınamadı; yalnızca titreşim");

        if (Prefs.vibrate(context)) startVibration();
        if (Prefs.flash(context)) {
            if (torch == null) torch = new Torch(context);
            torch.start();
        }
        if (Prefs.speak(context)) {
            Announcer.get(context).warmUp();
            handler.removeCallbacks(announceLoop);
            handler.postDelayed(announceLoop, ANNOUNCE_FIRST_MS);
        }
        handler.removeCallbacks(volumeEnforcer);
        handler.postDelayed(volumeEnforcer, VOLUME_ENFORCE_MS);
    }

    /** Sesli okunacak metin (servis bekleyen siparişler değiştikçe günceller). */
    synchronized void setAnnouncement(String text) {
        announcement = text;
    }

    private void pausePlayer() {
        try {
            if (player != null && player.isPlaying()) player.pause();
        } catch (Exception ignored) {
            // çalar hazır değil
        }
    }

    private synchronized void resumeAfterSpeech() {
        if (!active) return;
        try {
            if (player != null && !player.isPlaying()) player.start();
        } catch (Exception ignored) {
            // çalar kapanmış
        }
        handler.removeCallbacks(announceLoop);
        handler.postDelayed(announceLoop, ANNOUNCE_EVERY_MS);
    }

    synchronized void stop() {
        active = false;
        handler.removeCallbacks(volumeEnforcer);
        handler.removeCallbacks(announceLoop);
        Announcer.get(context).stop();
        if (torch != null) torch.stop();
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
                // zaten durmuş
            }
            player.release();
            player = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (focus != null) {
            audio.abandonAudioFocusRequest(focus);
            focus = null;
        }
        if (savedVolume >= 0) {
            try {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0);
            } catch (Exception e) {
                Log.w(TAG, "Ses seviyesi geri alınamadı", e);
            }
            savedVolume = -1;
        }
    }

    private void raiseVolume() {
        try {
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            if (audio.getStreamVolume(AudioManager.STREAM_ALARM) < max) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
            }
        } catch (Exception e) {
            // Rahatsız Etmeyin ayarı değiştirmeye izin vermeyebilir
            Log.w(TAG, "Ses seviyesi yükseltilemedi", e);
        }
    }

    private MediaPlayer createPlayer(Uri uri) {
        if (uri == null) return null;
        MediaPlayer mp = new MediaPlayer();
        try {
            mp.setAudioAttributes(alarmAttributes());
            mp.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK);
            mp.setDataSource(context, uri);
            mp.setLooping(true);
            mp.prepare();
            mp.start();
            return mp;
        } catch (Exception e) {
            Log.w(TAG, "Ses açılamadı: " + uri, e);
            mp.release();
            return null;
        }
    }

    private void startVibration() {
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager != null ? manager.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) {
            vibrator = null;
            return;
        }
        VibrationEffect effect = VibrationEffect.createWaveform(VIBRATION, 0);
        if (Build.VERSION.SDK_INT >= 33) {
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
        } else {
            vibrator.vibrate(effect, alarmAttributes());
        }
    }

    static Uri appSoundUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.siparis_zili);
    }

    /** Seçilen ses; seçilmediyse telefonun zil sesi; o da yoksa ("Sessiz") uygulamanın sesi. */
    static Uri chosenUri(Context context) {
        String saved = Prefs.soundUri(context);
        if (APP_SOUND.equals(saved)) return appSoundUri(context);
        if (saved != null && !saved.isEmpty()) return Uri.parse(saved);
        Uri ringtone = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE);
        // Varsayılan zil sesinin önbellekteki kopyası her uygulamaya açıktır (dosya izni gerekmez).
        return ringtone != null ? Settings.System.DEFAULT_RINGTONE_URI : appSoundUri(context);
    }

    static String soundName(Context context) {
        String saved = Prefs.soundUri(context);
        if (APP_SOUND.equals(saved)) return "Benim Marketim zil sesi";
        Uri uri = saved == null ? RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE) : chosenUri(context);
        if (uri == null) return "Telefonun zil sesi kapalı · Benim Marketim zil sesi çalar";
        String prefix = saved == null ? "Telefonun zil sesi" : "Seçilen ses";
        try {
            Ringtone ringtone = RingtoneManager.getRingtone(context, uri);
            String title = ringtone != null ? ringtone.getTitle(context) : null;
            if (title != null && !title.isEmpty()) return prefix + ": " + title;
        } catch (Exception ignored) {
            // başlık okunamadı
        }
        return prefix;
    }
}
