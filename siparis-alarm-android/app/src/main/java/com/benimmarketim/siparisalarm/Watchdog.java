package com.benimmarketim.siparisalarm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/**
 * Bekçi: 15 dakikada bir (ve servis kapatılınca birkaç saniye sonra) servisin ayakta olduğunu kontrol eder.
 * Kesin zamanlı, "boşta da çalışan" alarm kullanır; telefon derin uykudayken de tetiklenir.
 */
final class Watchdog {
    private static final String TAG = "Watchdog";
    private static final long INTERVAL_MS = 15 * 60 * 1000;

    private Watchdog() {
    }

    private static PendingIntent intent(Context context) {
        Intent intent = new Intent(context, WatchdogReceiver.class);
        return PendingIntent.getBroadcast(context, 30, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context context) {
        scheduleIn(context, INTERVAL_MS);
    }

    static void scheduleSoon(Context context, long delayMs) {
        scheduleIn(context, delayMs);
    }

    static boolean canExact(Context context) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        return am != null && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
    }

    private static void scheduleIn(Context context, long delayMs) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = SystemClock.elapsedRealtime() + delayMs;
        try {
            if (canExact(context)) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, intent(context));
            } else {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, intent(context));
            }
        } catch (Exception e) {
            Log.w(TAG, "Bekçi alarmı kurulamadı", e);
        }
    }

    static void cancel(Context context) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(intent(context));
    }
}
