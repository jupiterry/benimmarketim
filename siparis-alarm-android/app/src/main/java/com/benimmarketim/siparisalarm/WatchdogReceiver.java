package com.benimmarketim.siparisalarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WatchdogReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Prefs.isPaired(context)) return;
        Watchdog.schedule(context);
        if (!AlarmService.isRunning()) AlarmService.start(context);
    }
}
