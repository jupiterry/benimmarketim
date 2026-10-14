package com.benimmarketim.siparisalarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import java.util.List;

/** Bildirim kanalları ve bildirimler. */
final class Notifications {
    static final String CH_ALARM = "siparis_alarmi";
    static final String CH_SERVICE = "dinleme_servisi";
    static final String CH_WARNING = "baglanti_uyarisi";

    static final int ID_SERVICE = 1;
    static final int ID_ALARM = 2;
    static final int ID_WARNING = 3;

    private static final int BRAND = 0xFF168A52;

    private Notifications() {
    }

    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // Ses ve titreşimi servis kendisi çalar (onaylanana kadar sürsün diye); kanal sessizdir.
        NotificationChannel alarm = new NotificationChannel(CH_ALARM, "Yeni sipariş alarmı", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("Yeni siparişte tam ekran uyarı. Sesi uygulama kendisi çalar.");
        alarm.setSound(null, null);
        alarm.enableVibration(false);
        alarm.setBypassDnd(true);
        alarm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        alarm.enableLights(true);
        alarm.setLightColor(Color.GREEN);
        manager.createNotificationChannel(alarm);

        NotificationChannel service = new NotificationChannel(CH_SERVICE, "Sipariş dinleme", NotificationManager.IMPORTANCE_LOW);
        service.setDescription("Uygulamanın arka planda açık kaldığını gösterir.");
        service.setShowBadge(false);
        manager.createNotificationChannel(service);

        NotificationChannel warning = new NotificationChannel(CH_WARNING, "Bağlantı uyarısı", NotificationManager.IMPORTANCE_HIGH);
        warning.setDescription("Sunucuya ulaşılamadığında ya da eşleme kaldırıldığında uyarır.");
        warning.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        manager.createNotificationChannel(warning);
    }

    private static PendingIntent openMain(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 10, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent openAlarm(Context context) {
        Intent intent = AlarmActivity.intent(context);
        return PendingIntent.getActivity(context, 11, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent ackIntent(Context context, String orderId, String action, int requestCode) {
        Intent intent = new Intent(context, AckReceiver.class)
                .setAction(AckReceiver.ACTION_ACK)
                .putExtra(AckReceiver.EXTRA_ORDER_ID, orderId)
                .putExtra(AckReceiver.EXTRA_ACTION, action);
        return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent repostIntent(Context context) {
        Intent intent = new Intent(context, AckReceiver.class).setAction(AckReceiver.ACTION_REPOST);
        return PendingIntent.getBroadcast(context, 12, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Servisin sürekli bildirimi */
    static Notification service(Context context, boolean connected, String detail) {
        Notification.Builder builder = new Notification.Builder(context, CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setColor(BRAND)
                .setContentTitle(connected ? "Sipariş alarmı açık" : "Sipariş alarmı: bağlantı bekleniyor")
                .setContentText(detail)
                .setOngoing(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(openMain(context));
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    /** Yeni sipariş: kilitliyken tam ekran açılır, açıkken üstte kalıcı uyarı olarak görünür. */
    static Notification alarm(Context context, List<AlarmOrder> orders) {
        AlarmOrder first = orders.get(0);
        String title = orders.size() == 1
                ? "Yeni sipariş " + first.number + " · " + Format.money(first.totalAmount)
                : orders.size() + " sipariş onay bekliyor";
        String text = first.customerName + " · " + first.address;
        StringBuilder big = new StringBuilder();
        big.append(text).append('\n');
        int shown = 0;
        for (AlarmOrder.Item item : first.products) {
            if (shown++ == 6) {
                big.append("… ve ").append(first.products.size() - 6).append(" ürün daha\n");
                break;
            }
            big.append(item.quantity).append(" × ").append(item.name).append('\n');
        }
        big.append("Ödeme: ").append(first.paymentMethod).append(" · Toplam: ").append(Format.money(first.totalAmount));
        if (orders.size() > 1) big.append("\nİlk sipariş: ").append(first.number);

        Notification.Builder builder = new Notification.Builder(context, CH_ALARM)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setColor(BRAND)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(big.toString()))
                .setCategory(Notification.CATEGORY_CALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setWhen(first.createdAt)
                .setShowWhen(true)
                .setContentIntent(openAlarm(context))
                .setFullScreenIntent(openAlarm(context), true)
                .setDeleteIntent(repostIntent(context))
                .addAction(new Notification.Action.Builder(null, "Siparişi Gördüm", ackIntent(context, first.id, "seen", 20)).build())
                .addAction(new Notification.Action.Builder(null, "Kabul Et", ackIntent(context, first.id, "accepted", 21)).build());
        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_NO_CLEAR;
        return notification;
    }

    static Notification warning(Context context, String title, String text) {
        return new Notification.Builder(context, CH_WARNING)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setColor(0xFFD93B3B)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ERROR)
                .setOnlyAlertOnce(true)
                .setAutoCancel(true)
                .setContentIntent(openMain(context))
                .build();
    }
}
