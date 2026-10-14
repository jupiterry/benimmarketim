package com.benimmarketim.siparisalarm;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Uygulama ayarları ve kalıcı durum (eşleme, alarm tercihleri, bekleyen siparişler, onay kuyruğu). */
public final class Prefs {
    public static final String DEFAULT_SERVER = "https://devrekbenimmarketim.com";

    private static final String FILE = "siparis_alarm";
    private static final String KEY_SERVER = "server";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_DEVICE_NAME = "device_name";
    private static final String KEY_ADMIN_NAME = "admin_name";
    private static final String KEY_MAX_VOLUME = "max_volume";
    private static final String KEY_VIBRATE = "vibrate";
    private static final String KEY_SOUND_URI = "sound_uri";
    private static final String KEY_ACTIVE = "active_orders";
    private static final String KEY_LOCAL_ACKS = "local_acks";
    private static final String KEY_ACK_QUEUE = "ack_queue";
    private static final String KEY_HISTORY = "history";
    private static final String KEY_LAST_SUCCESS = "last_success";
    private static final String KEY_PERMISSIONS_ASKED = "permissions_asked";

    private static final int HISTORY_LIMIT = 15;

    private Prefs() {
    }

    private static SharedPreferences sp(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    // ─── Eşleme ───

    public static boolean isPaired(Context context) {
        return getToken(context) != null;
    }

    public static String getServer(Context context) {
        return sp(context).getString(KEY_SERVER, DEFAULT_SERVER);
    }

    public static String getToken(Context context) {
        String token = sp(context).getString(KEY_TOKEN, null);
        return token == null || token.isEmpty() ? null : token;
    }

    public static String getDeviceName(Context context) {
        return sp(context).getString(KEY_DEVICE_NAME, "");
    }

    public static String getAdminName(Context context) {
        return sp(context).getString(KEY_ADMIN_NAME, "");
    }

    public static void savePairing(Context context, String server, String token, String deviceName, String adminName) {
        sp(context).edit()
                .putString(KEY_SERVER, server)
                .putString(KEY_TOKEN, token)
                .putString(KEY_DEVICE_NAME, deviceName)
                .putString(KEY_ADMIN_NAME, adminName)
                .remove(KEY_ACTIVE)
                .remove(KEY_LOCAL_ACKS)
                .remove(KEY_ACK_QUEUE)
                .putLong(KEY_LAST_SUCCESS, System.currentTimeMillis())
                .commit();
    }

    /** Eşlemeyi siler; alarm tercihleri ve son kullanılan sunucu kalır. */
    public static void clearPairing(Context context) {
        sp(context).edit()
                .remove(KEY_TOKEN)
                .remove(KEY_ACTIVE)
                .remove(KEY_LOCAL_ACKS)
                .remove(KEY_ACK_QUEUE)
                .remove(KEY_HISTORY)
                .remove(KEY_LAST_SUCCESS)
                .commit();
    }

    // ─── Alarm tercihleri ───

    public static boolean maxVolume(Context context) {
        return sp(context).getBoolean(KEY_MAX_VOLUME, true);
    }

    public static void setMaxVolume(Context context, boolean value) {
        sp(context).edit().putBoolean(KEY_MAX_VOLUME, value).apply();
    }

    public static boolean vibrate(Context context) {
        return sp(context).getBoolean(KEY_VIBRATE, true);
    }

    public static void setVibrate(Context context, boolean value) {
        sp(context).edit().putBoolean(KEY_VIBRATE, value).apply();
    }

    /** null: telefonun varsayılan zil sesi; "app": uygulamanın kendi zil sesi; diğerleri: seçilen ses. */
    public static String soundUri(Context context) {
        return sp(context).getString(KEY_SOUND_URI, null);
    }

    public static void setSoundUri(Context context, String value) {
        sp(context).edit().putString(KEY_SOUND_URI, value).apply();
    }

    public static boolean permissionsAsked(Context context) {
        return sp(context).getBoolean(KEY_PERMISSIONS_ASKED, false);
    }

    public static void setPermissionsAsked(Context context) {
        sp(context).edit().putBoolean(KEY_PERMISSIONS_ASKED, true).apply();
    }

    // ─── Çalışma durumu ───

    public static long lastSuccess(Context context) {
        return sp(context).getLong(KEY_LAST_SUCCESS, 0);
    }

    public static void setLastSuccess(Context context, long value) {
        sp(context).edit().putLong(KEY_LAST_SUCCESS, value).apply();
    }

    /** Alarmı çalan (henüz onaylanmamış) siparişler; uygulama kapanıp açılsa da alarm sürer. */
    public static List<AlarmOrder> activeOrders(Context context) {
        List<AlarmOrder> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(sp(context).getString(KEY_ACTIVE, "[]"));
            for (int i = 0; i < array.length(); i++) {
                list.add(AlarmOrder.fromJson(array.getJSONObject(i)));
            }
        } catch (JSONException ignored) {
            // bozuk kayıt: boş liste
        }
        return list;
    }

    public static void setActiveOrders(Context context, List<AlarmOrder> orders) {
        JSONArray array = new JSONArray();
        for (AlarmOrder order : orders) {
            array.put(order.json);
        }
        sp(context).edit().putString(KEY_ACTIVE, array.toString()).commit();
    }

    /** Bu telefonda onaylanmış ama sunucu listesinden henüz düşmemiş siparişler (tekrar çalmasın). */
    public static Set<String> localAcks(Context context) {
        return new LinkedHashSet<>(sp(context).getStringSet(KEY_LOCAL_ACKS, new LinkedHashSet<String>()));
    }

    public static void setLocalAcks(Context context, Set<String> ids) {
        sp(context).edit().putStringSet(KEY_LOCAL_ACKS, new LinkedHashSet<>(ids)).commit();
    }

    /** Sunucuya henüz ulaştırılamamış onaylar: "siparişId|işlem" */
    public static Set<String> ackQueue(Context context) {
        return new LinkedHashSet<>(sp(context).getStringSet(KEY_ACK_QUEUE, new LinkedHashSet<String>()));
    }

    public static void setAckQueue(Context context, Set<String> items) {
        sp(context).edit().putStringSet(KEY_ACK_QUEUE, new LinkedHashSet<>(items)).commit();
    }

    // ─── Bu telefondaki son onaylar ───

    public static List<JSONObject> history(Context context) {
        List<JSONObject> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(sp(context).getString(KEY_HISTORY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                list.add(array.getJSONObject(i));
            }
        } catch (JSONException ignored) {
            // bozuk kayıt
        }
        return list;
    }

    public static void addHistory(Context context, AlarmOrder order, String action) {
        try {
            JSONObject item = new JSONObject();
            item.put("number", order.number);
            item.put("customer", order.customerName);
            item.put("total", order.totalAmount);
            item.put("action", action);
            item.put("at", System.currentTimeMillis());
            List<JSONObject> list = history(context);
            list.add(0, item);
            JSONArray array = new JSONArray();
            for (int i = 0; i < list.size() && i < HISTORY_LIMIT; i++) {
                array.put(list.get(i));
            }
            sp(context).edit().putString(KEY_HISTORY, array.toString()).apply();
        } catch (JSONException ignored) {
            // geçmiş isteğe bağlıdır
        }
    }
}
