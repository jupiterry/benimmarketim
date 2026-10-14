package com.benimmarketim.siparisalarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Telefon açılınca ve uygulama güncellenince dinlemeyi yeniden başlatır. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Prefs.isPaired(context)) return;
        Watchdog.schedule(context);
        AlarmService.start(context);
    }
}
