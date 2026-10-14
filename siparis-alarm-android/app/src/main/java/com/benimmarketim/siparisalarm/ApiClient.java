package com.benimmarketim.siparisalarm;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Benim Marketim sunucusundaki /api/order-alarm uçları.
 * Ek kütüphane kullanmaz (HttpURLConnection + org.json); bağlantılar yeniden kullanılır.
 */
public final class ApiClient {

    public static final int LONG_POLL_SECONDS = 25;

    /** Sunucu hata döndürdü (status 0: ağ hatası). */
    public static class ApiException extends IOException {
        public final int status;

        public ApiException(int status, String message) {
            super(message);
            this.status = status;
        }

        public boolean isUnauthorized() {
            return status == 401;
        }

        /** Tekrar denemenin anlamı olmayan istek hatası (geçersiz/silinmiş sipariş vb.) */
        public boolean isPermanent() {
            return status >= 400 && status < 500 && status != 401 && status != 408 && status != 429;
        }
    }

    public static final class PairResult {
        public final String token;
        public final String deviceName;
        public final String adminName;

        PairResult(String token, String deviceName, String adminName) {
            this.token = token;
            this.deviceName = deviceName;
            this.adminName = adminName;
        }
    }

    /** Aktif bağlantı (ağ değişince kesip hemen yeniden bağlanmak için) */
    private static volatile HttpURLConnection current;

    private ApiClient() {
    }

    /** "https://site.com", "site.com/" ya da ".../api" girişlerinden uç kökünü üretir. */
    public static String normalizeServer(String input) {
        String s = input == null ? "" : input.trim();
        if (s.isEmpty()) s = Prefs.DEFAULT_SERVER;
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (s.endsWith("/api")) s = s.substring(0, s.length() - 4);
        return s;
    }

    private static String endpoint(String server, String path) {
        return normalizeServer(server) + "/api/order-alarm" + path;
    }

    public static PairResult pair(String server, String email, String password, String deviceName) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
            body.put("password", password);
            body.put("deviceName", deviceName);
        } catch (JSONException e) {
            throw new IOException(e);
        }
        JSONObject json = request("POST", endpoint(server, "/pair"), null, body, 20);
        JSONObject device = json.optJSONObject("device");
        JSONObject user = json.optJSONObject("user");
        String token = json.optString("token", "");
        if (token.isEmpty()) throw new ApiException(500, "Sunucu eşleme anahtarı göndermedi.");
        return new PairResult(token, device != null ? device.optString("name", deviceName) : deviceName,
                user != null ? user.optString("name", "") : "");
    }

    /** Bekleyen siparişler. Liste `known` ile aynıysa sunucu en çok `waitSeconds` sn bekletir. */
    public static List<AlarmOrder> pending(String server, String token, Collection<String> known, int waitSeconds) throws IOException {
        StringBuilder ids = new StringBuilder();
        for (String id : known) {
            if (ids.length() > 0) ids.append(',');
            ids.append(id);
        }
        String url = endpoint(server, "/pending") + "?wait=" + waitSeconds + "&known=" + URLEncoder.encode(ids.toString(), "UTF-8");
        JSONObject json = request("GET", url, token, null, waitSeconds + 20);
        List<AlarmOrder> orders = new ArrayList<>();
        JSONArray array = json.optJSONArray("orders");
        if (array != null) {
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item != null && !item.optString("id", "").isEmpty()) orders.add(AlarmOrder.fromJson(item));
            }
        }
        return orders;
    }

    /** action: "seen" (Siparişi Gördüm) ya da "accepted" (Kabul Et) */
    public static void ack(String server, String token, String orderId, String action) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("action", action);
        } catch (JSONException e) {
            throw new IOException(e);
        }
        request("POST", endpoint(server, "/orders/" + URLEncoder.encode(orderId, "UTF-8") + "/ack"), token, body, 20);
    }

    public static void logout(String server, String token) throws IOException {
        request("POST", endpoint(server, "/logout"), token, new JSONObject(), 15);
    }

    /** Ağ değişince bekleyen uzun isteği keser; servis hemen yeniden bağlanır. */
    public static void abortCurrent() {
        HttpURLConnection connection = current;
        if (connection == null) return;
        // Kapatma ağ trafiği yaratabilir; ana iş parçacığında yapılmaz.
        new Thread(() -> {
            try {
                connection.disconnect();
            } catch (Exception ignored) {
                // zaten kapanmış
            }
        }, "baglanti-kes").start();
    }

    private static JSONObject request(String method, String url, String token, JSONObject body, int readTimeoutSeconds) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        current = connection;
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(readTimeoutSeconds * 1000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "BenimMarketimSiparisAlarmi/" + BuildInfo.VERSION_NAME + " (Android " + android.os.Build.VERSION.RELEASE + ")");
            connection.setRequestProperty("X-App-Version", BuildInfo.VERSION_NAME);
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            String text = readAll(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            JSONObject json = null;
            try {
                json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            } catch (JSONException e) {
                // HTML hata sayfası vb.
            }
            if (status >= 400) {
                String message = json != null ? json.optString("message", "") : "";
                if (status == 404 && (json == null || message.isEmpty() || message.startsWith("Cannot "))) {
                    // Express'in kendi 404 sayfası: /api/order-alarm uçları sunucuda yok.
                    message = "Sunucuda sipariş alarmı bulunamadı (404). Backend güncellemesi henüz canlıya alınmamış.";
                } else if (message.isEmpty()) {
                    message = "Sunucu hatası (" + status + ")";
                }
                throw new ApiException(status, message);
            }
            if (json == null) {
                throw new ApiException(status, "Sunucudan beklenmeyen yanıt geldi. Sunucu adresini kontrol edin.");
            }
            return json;
        } finally {
            if (current == connection) current = null;
        }
    }

    private static String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > 2_000_000) throw new IOException("Yanıt çok büyük");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8).trim();
        }
    }
}
