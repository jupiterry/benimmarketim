package com.benimmarketim.siparisalarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Bildirimdeki "Siparişi Gördüm" / "Kabul Et" düğmeleri ve silinen alarm bildiriminin geri getirilmesi. */
public class AckReceiver extends BroadcastReceiver {
    static final String ACTION_ACK = "com.benimmarketim.siparisalarm.ACK";
    static final String ACTION_REPOST = "com.benimmarketim.siparisalarm.REPOST";
    static final String EXTRA_ORDER_ID = "orderId";
    static final String EXTRA_ACTION = "action";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_ACK.equals(action)) {
            String ackAction = intent.getStringExtra(EXTRA_ACTION);
            AlarmService.acknowledge(context, intent.getStringExtra(EXTRA_ORDER_ID),
                    "accepted".equals(ackAction) ? "accepted" : "seen");
        } else if (ACTION_REPOST.equals(action)) {
            AlarmService.repostAlarm(context);
        }
    }
}
