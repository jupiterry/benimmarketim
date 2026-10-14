package com.benimmarketim.siparisalarm;

import android.app.Application;

public class AlarmApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Notifications.createChannels(this);
        // Telefon eşliyse servis her açılışta ayakta olsun; bekçi alarmı da kurulur.
        if (Prefs.isPaired(this)) {
            Watchdog.schedule(this);
        }
    }
}
