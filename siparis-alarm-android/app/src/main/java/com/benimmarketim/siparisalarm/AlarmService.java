package com.benimmarketim.siparisalarm;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Siparişleri sürekli dinleyen ön plan servisi.
 *
 * Sunucuya uzun bekletmeli istek (long-poll) açık tutulur; yeni sipariş gelince alarm çalar, tam ekran
 * uyarı açılır. Alarm, siparişe bu telefonda ya da başka bir eşli telefonda "Gördüm"/"Kabul Et"
 * denene kadar (veya sipariş panelde Yolda/İptal yapılana kadar) susmaz.
 */
public class AlarmService extends Service {
    private static final String TAG = "AlarmService";

    static final String ACTION_START = "com.benimmarketim.siparisalarm.START";
    static final String ACTION_TEST = "com.benimmarketim.siparisalarm.TEST";
    static final String ACTION_SHUTDOWN = "com.benimmarketim.siparisalarm.SHUTDOWN";

    private static final long WARN_AFTER_MS = 2 * 60 * 1000;
    private static final long WARN_REPEAT_MS = 15 * 60 * 1000;
    private static final long ALARM_REPOST_MS = 2 * 60 * 1000;
    private static final long TEST_DELAY_MS = 10 * 1000;

    /** Ekranların durum değişikliğini dinlemesi için */
    public interface Listener {
        void onAlarmStateChanged();
    }

    private static final Set<Listener> listeners = new CopyOnWriteArraySet<>();
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final Object STATE_LOCK = new Object();

    private static volatile AlarmService instance;
    private static volatile boolean connected;
    private static volatile String lastError = "";
    private static volatile AlarmOrder testOrder;

    private final Object sleepLock = new Object();
    private final ExecutorService ackExecutor = Executors.newSingleThreadExecutor();
    private final Set<String> alertedIds = new HashSet<>();
    private volatile boolean stopRequested;
    private volatile boolean shutdown;
    private volatile List<AlarmOrder> serverOrders = new ArrayList<>();
    private volatile List<String> knownIds = new ArrayList<>();
    private Thread worker;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean warningShown;
    private long warningAt;
    private long alarmPostedAt;
    private String alarmPostedKey = "";
    private Boolean lastNotifiedConnected;

    // ─── Dışarıdan kullanım ───────────────────────────────────────

    public static void start(Context context) {
        if (!Prefs.isPaired(context)) return;
        Intent intent = new Intent(context, AlarmService.class).setAction(ACTION_START);
        try {
            context.startForegroundService(intent);
        } catch (Exception e) {
            // Arka plandan başlatma kısıtı: bekçi alarmı kısa süre sonra yeniden dener.
            Log.w(TAG, "Servis başlatılamadı", e);
            Watchdog.scheduleSoon(context, 30_000);
        }
    }

    public static void startTest(Context context) {
        Intent intent = new Intent(context, AlarmService.class).setAction(ACTION_TEST);
        context.startForegroundService(intent);
    }

    /** Eşleme kaldırıldı: servisi tamamen kapatır (yeniden başlatılmaz). */
    public static void shutdown(Context context) {
        AlarmService service = instance;
        if (service != null) {
            service.shutdownNow();
        }
        AlarmSound.get(context).stop();
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(Notifications.ID_ALARM);
        Watchdog.cancel(context);
        notifyListeners();
    }

    public static boolean isRunning() {
        return instance != null;
    }

    public static boolean isConnected() {
        return instance != null && connected;
    }

    public static String lastError() {
        return lastError;
    }

    public static void addListener(Listener listener) {
        listeners.add(listener);
    }

    public static void removeListener(Listener listener) {
        listeners.remove(listener);
    }

    static void notifyListeners() {
        main.post(() -> {
            for (Listener listener : listeners) listener.onAlarmStateChanged();
        });
    }

    /** "Siparişi Gördüm" / "Kabul Et": alarm hemen susar, onay sunucuya gönderilir (ağ yoksa kuyrukta bekler). */
    public static void acknowledge(Context context, String orderId, String action) {
        Context app = context.getApplicationContext();
        if (orderId == null || orderId.isEmpty()) return;
        synchronized (STATE_LOCK) {
            List<AlarmOrder> active = Prefs.activeOrders(app);
            List<AlarmOrder> remaining = new ArrayList<>();
            for (AlarmOrder order : active) {
                if (order.id.equals(orderId)) {
                    Prefs.addHistory(app, order, action);
                } else {
                    remaining.add(order);
                }
            }
            Prefs.setActiveOrders(app, remaining);
            if (AlarmOrder.TEST_ID.equals(orderId)) {
                testOrder = null;
            } else {
                Set<String> acks = Prefs.localAcks(app);
                acks.add(orderId);
                Prefs.setLocalAcks(app, acks);
                Set<String> queue = Prefs.ackQueue(app);
                queue.add(orderId + "|" + action);
                Prefs.setAckQueue(app, queue);
            }
        }
        AlarmService service = instance;
        if (service != null) {
            service.onLocalAck();
        } else {
            if (Prefs.activeOrders(app).isEmpty()) {
                AlarmSound.get(app).stop();
                NotificationManager nm = app.getSystemService(NotificationManager.class);
                if (nm != null) nm.cancel(Notifications.ID_ALARM);
            }
            start(app);
        }
        notifyListeners();
    }

    /** Alarm bildirimi kaydırılıp silinirse yeniden gösterilir (sipariş onaylanmadıkça). */
    static void repostAlarm(Context context) {
        AlarmService service = instance;
        if (service != null) service.main(() -> service.refreshAlarm(true));
        else start(context);
    }

    // ─── Servis yaşam döngüsü ────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Notifications.createChannels(this);
        goForeground();

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            // Ekran kapalıyken de bağlantı ve alarm sürsün.
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BenimMarketim:SiparisAlarmi");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "BenimMarketim:SiparisAlarmi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "Wi-Fi kilidi alınamadı", e);
        }
        registerNetworkCallback();
        if (Prefs.speak(this)) Announcer.get(this).warmUp();

        // Uygulama kapanıp açıldıysa onaylanmamış siparişler için alarm hemen sürer.
        serverOrders = filterOutTest(Prefs.activeOrders(this));
        List<String> ids = new ArrayList<>();
        for (AlarmOrder order : serverOrders) ids.add(order.id);
        knownIds = ids;
        refreshAlarm(false);

        worker = new Thread(this::loop, "siparis-dinleyici");
        worker.start();
        Watchdog.schedule(this);
        notifyListeners();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // startForegroundService() her çağrıldığında ön plana geçiş beklenir.
        goForeground();
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_SHUTDOWN.equals(action) || !Prefs.isPaired(this)) {
            shutdownNow();
            return START_NOT_STICKY;
        }
        if (ACTION_TEST.equals(action)) {
            // Telefonu kilitleyip denemek için 10 sn sonra çalar.
            main.postDelayed(() -> {
                if (instance != this || shutdown) return;
                testOrder = AlarmOrder.sample();
                refreshAlarm(false);
            }, TEST_DELAY_MS);
        }
        wake();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // Son uygulamalardan kaydırılınca bazı telefonlar servisi de kapatır; hemen geri gelsin.
        if (!shutdown) Watchdog.scheduleSoon(this, 3000);
    }

    @Override
    public void onDestroy() {
        stopRequested = true;
        instance = null;
        connected = false;
        ApiClient.abortCurrent();
        wake();
        ackExecutor.shutdownNow();
        unregisterNetworkCallback();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (shutdown) {
            AlarmSound.get(this).stop();
        } else if (Prefs.isPaired(this)) {
            // Sistem kapattıysa: alarm çalıyorsa sürer, servis birkaç saniyede geri gelir.
            Watchdog.scheduleSoon(this, 5000);
        }
        notifyListeners();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void goForeground() {
        boolean isConnected = connected;
        Notification notification = Notifications.service(this, isConnected, serviceText(isConnected));
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(Notifications.ID_SERVICE, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(Notifications.ID_SERVICE, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Ön plan servisi başlatılamadı", e);
            Watchdog.scheduleSoon(this, 30_000);
            stopSelf();
        }
    }

    private String serviceText(boolean isConnected) {
        return isConnected
                ? "Bağlı · yeni siparişte alarm çalar"
                : "Sunucuya bağlanılıyor… (" + Prefs.getDeviceName(this) + ")";
    }

    private void updateServiceNotification() {
        boolean isConnected = connected;
        if (lastNotifiedConnected != null && lastNotifiedConnected == isConnected) return;
        lastNotifiedConnected = isConnected;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(Notifications.ID_SERVICE, Notifications.service(this, isConnected, serviceText(isConnected)));
    }

    private void shutdownNow() {
        shutdown = true;
        stopRequested = true;
        ApiClient.abortCurrent();
        wake();
        AlarmSound.get(this).stop();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(Notifications.ID_ALARM);
        Watchdog.cancel(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ─── Dinleme döngüsü ─────────────────────────────────────────

    private void loop() {
        int failures = 0;
        boolean first = true;
        while (!stopRequested) {
            String token = Prefs.getToken(this);
            if (token == null) {
                main(this::shutdownNow);
                return;
            }
            String server = Prefs.getServer(this);
            try {
                flushAcks();
                // İlk istek beklemeden döner (durum hemen görünsün); sonrakiler uzun bekletmelidir.
                int wait = first || failures > 0 ? 0 : ApiClient.LONG_POLL_SECONDS;
                List<AlarmOrder> orders = ApiClient.pending(server, token, knownIds, wait);
                if (stopRequested) return;
                first = false;
                failures = 0;
                onPollSuccess(orders);
            } catch (ApiClient.ApiException e) {
                if (e.isUnauthorized()) {
                    main(this::onUnauthorized);
                    return;
                }
                failures++;
                onPollFailure(e.getMessage());
                sleep(backoff(failures));
            } catch (IOException e) {
                if (stopRequested) return;
                failures++;
                onPollFailure(networkMessage(e));
                sleep(backoff(failures));
            } catch (RuntimeException e) {
                Log.e(TAG, "Beklenmeyen hata", e);
                failures++;
                onPollFailure("Beklenmeyen hata: " + e.getClass().getSimpleName());
                sleep(backoff(failures));
            }
        }
    }

    private static long backoff(int failures) {
        long[] steps = {2000, 5000, 10000, 20000, 30000};
        return steps[Math.min(failures, steps.length) - 1];
    }

    private static String networkMessage(IOException e) {
        String name = e.getClass().getSimpleName();
        if (name.contains("UnknownHost")) return "İnternet yok ya da sunucu adı çözülemedi";
        if (name.contains("Timeout")) return "Sunucu yanıt vermedi (zaman aşımı)";
        if (name.contains("SSL")) return "Güvenli bağlantı kurulamadı";
        return "Bağlantı hatası: " + (e.getMessage() != null ? e.getMessage() : name);
    }

    private void sleep(long ms) {
        synchronized (sleepLock) {
            try {
                sleepLock.wait(ms);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void wake() {
        synchronized (sleepLock) {
            sleepLock.notifyAll();
        }
    }

    private void onPollSuccess(List<AlarmOrder> orders) {
        long now = System.currentTimeMillis();
        Prefs.setLastSuccess(this, now);
        lastError = "";
        connected = true;
        List<String> ids = new ArrayList<>();
        for (AlarmOrder order : orders) ids.add(order.id);
        synchronized (STATE_LOCK) {
            // Sunucudan düşen ve gönderim kuyruğunda olmayan yerel onaylar artık gerekmez.
            Set<String> keep = new HashSet<>(ids);
            for (String item : Prefs.ackQueue(this)) keep.add(item.split("\\|")[0]);
            Set<String> acks = Prefs.localAcks(this);
            if (acks.retainAll(keep)) Prefs.setLocalAcks(this, acks);
            serverOrders = orders;
            knownIds = ids;
        }
        main(() -> {
            if (warningShown) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) nm.cancel(Notifications.ID_WARNING);
                warningShown = false;
            }
            updateServiceNotification();
            refreshAlarm(false);
        });
    }

    private void onPollFailure(String message) {
        connected = false;
        lastError = message == null ? "Bağlantı hatası" : message;
        Log.w(TAG, "Sipariş kontrolü başarısız: " + lastError);
        main(() -> {
            updateServiceNotification();
            long now = System.currentTimeMillis();
            long last = Prefs.lastSuccess(this);
            boolean due = !warningShown ? now - last > WARN_AFTER_MS : now - warningAt > WARN_REPEAT_MS;
            if (due && !stopRequested) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    nm.cancel(Notifications.ID_WARNING);
                    nm.notify(Notifications.ID_WARNING, Notifications.warning(this,
                            "Siparişler alınamıyor",
                            "Son başarılı kontrol: " + (last > 0 ? Format.dateTime(last) : "yok") + ". " + lastError
                                    + ". İnternet bağlantısını kontrol edin; bağlantı gelince alarm kendiliğinden devam eder."));
                }
                warningShown = true;
                warningAt = now;
            }
            notifyListeners();
        });
    }

    private void onUnauthorized() {
        Prefs.clearPairing(this);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(Notifications.ID_WARNING, Notifications.warning(this,
                    "Sipariş alarmı kapandı",
                    "Bu telefonun eşlemesi kaldırılmış. Alarm almak için uygulamayı açıp yeniden giriş yapın."));
        }
        shutdownNow();
        notifyListeners();
    }

    // ─── Onaylar ─────────────────────────────────────────────────

    private void onLocalAck() {
        synchronized (STATE_LOCK) {
            Set<String> acks = Prefs.localAcks(this);
            List<AlarmOrder> remaining = new ArrayList<>();
            for (AlarmOrder order : serverOrders) {
                if (!acks.contains(order.id)) remaining.add(order);
            }
            serverOrders = remaining;
        }
        main(() -> refreshAlarm(false));
        try {
            ackExecutor.execute(() -> {
                try {
                    flushAcks();
                } catch (ApiClient.ApiException e) {
                    if (e.isUnauthorized()) main(this::onUnauthorized);
                } catch (IOException ignored) {
                    // kuyrukta kalır, dinleme döngüsü yeniden dener
                }
            });
        } catch (Exception ignored) {
            // servis kapanıyor: kuyruk bir sonraki açılışta gönderilir
        }
    }

    /** Kuyruktaki onayları gönderir. Ağ hatasında kuyruk korunur. */
    private void flushAcks() throws IOException {
        synchronized (ackExecutor) {
            String token = Prefs.getToken(this);
            if (token == null) return;
            String server = Prefs.getServer(this);
            for (String item : Prefs.ackQueue(this)) {
                String[] parts = item.split("\\|");
                if (parts.length != 2) {
                    removeFromQueue(item);
                    continue;
                }
                try {
                    ApiClient.ack(server, token, parts[0], parts[1]);
                    removeFromQueue(item);
                } catch (ApiClient.ApiException e) {
                    if (e.isPermanent()) {
                        removeFromQueue(item); // sipariş silinmiş vb.
                    } else {
                        throw e;
                    }
                }
            }
        }
    }

    private void removeFromQueue(String item) {
        synchronized (STATE_LOCK) {
            Set<String> queue = Prefs.ackQueue(this);
            if (queue.remove(item)) Prefs.setAckQueue(this, queue);
        }
    }

    // ─── Alarm ───────────────────────────────────────────────────

    private static List<AlarmOrder> filterOutTest(List<AlarmOrder> orders) {
        List<AlarmOrder> result = new ArrayList<>();
        for (AlarmOrder order : orders) if (!order.isTest()) result.add(order);
        return result;
    }

    private List<AlarmOrder> computeActive() {
        Set<String> acks = Prefs.localAcks(this);
        List<AlarmOrder> active = new ArrayList<>();
        for (AlarmOrder order : serverOrders) {
            if (!acks.contains(order.id)) active.add(order);
        }
        AlarmOrder test = testOrder;
        if (test != null) active.add(test);
        return active;
    }

    /** Alarmı bekleyen siparişlere göre başlatır/durdurur. Ana iş parçacığında çağrılır. */
    private void refreshAlarm(boolean forceRepost) {
        List<AlarmOrder> active;
        synchronized (STATE_LOCK) {
            active = computeActive();
            Prefs.setActiveOrders(this, active);
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (active.isEmpty()) {
            AlarmSound.get(this).stop();
            if (nm != null) nm.cancel(Notifications.ID_ALARM);
            alertedIds.clear();
            alarmPostedKey = "";
            notifyListeners();
            return;
        }

        boolean hasNew = false;
        StringBuilder key = new StringBuilder();
        Set<String> activeIds = new LinkedHashSet<>();
        for (AlarmOrder order : active) {
            activeIds.add(order.id);
            key.append(order.id).append(',');
            if (alertedIds.add(order.id)) hasNew = true;
        }
        alertedIds.retainAll(activeIds);

        AlarmSound sound = AlarmSound.get(this);
        sound.setAnnouncement(active.size() == 1
                ? active.get(0).spokenSummary()
                : active.size() + " sipariş onay bekliyor. İlk sipariş: " + active.get(0).spokenSummary().replace("Yeni sipariş. ", ""));
        sound.start();
        long now = System.currentTimeMillis();
        boolean changed = !key.toString().equals(alarmPostedKey);
        if (nm != null && (changed || forceRepost || now - alarmPostedAt > ALARM_REPOST_MS)) {
            nm.notify(Notifications.ID_ALARM, Notifications.alarm(this, active));
            alarmPostedAt = now;
            alarmPostedKey = key.toString();
        }
        if (hasNew) launchAlarmScreen();
        notifyListeners();
    }

    /**
     * Kilit ekranında tam ekran bildirim ekranı zaten açar. Telefon açıkken de ekranın gelmesi için
     * doğrudan açmayı dener ("Diğer uygulamaların üzerinde göster" izni varsa Android buna izin verir).
     */
    private void launchAlarmScreen() {
        try {
            startActivity(AlarmActivity.intent(this));
        } catch (Exception e) {
            Log.w(TAG, "Alarm ekranı açılamadı; bildirim gösteriliyor", e);
        }
    }

    // ─── Ağ değişikliği ──────────────────────────────────────────

    private void registerNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Bağlantı yokken ağ geldiyse beklemeden yeniden dene.
                if (!connected) {
                    ApiClient.abortCurrent();
                    wake();
                }
            }

            @Override
            public void onLost(Network network) {
                // Ölü bağlantıda 45 sn beklemek yerine hemen yenisini kur.
                ApiClient.abortCurrent();
                wake();
            }
        };
        try {
            cm.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception e) {
            Log.w(TAG, "Ağ dinleyicisi kurulamadı", e);
            networkCallback = null;
        }
    }

    private void unregisterNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null && networkCallback != null) {
            try {
                cm.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // zaten kaldırılmış
            }
        }
        networkCallback = null;
    }

    private void main(Runnable runnable) {
        main.post(runnable);
    }
}
