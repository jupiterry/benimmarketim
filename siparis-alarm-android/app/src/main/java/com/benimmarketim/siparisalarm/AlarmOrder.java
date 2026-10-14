package com.benimmarketim.siparisalarm;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Sunucunun /api/order-alarm/pending yanıtındaki sipariş özeti. */
public final class AlarmOrder {
    public static final String TEST_ID = "test";

    public static final class Item {
        public final String name;
        public final int quantity;
        public final double price;
        public final double lineTotal;

        Item(String name, int quantity, double price, double lineTotal) {
            this.name = name;
            this.quantity = quantity;
            this.price = price;
            this.lineTotal = lineTotal;
        }
    }

    public final JSONObject json;
    public final String id;
    public final String number;
    public final long createdAt;
    public final String customerName;
    public final String phone;
    public final String address;
    public final String note;
    public final String paymentMethod;
    public final List<Item> products;
    public final int itemCount;
    public final double subtotalAmount;
    public final String couponCode;
    public final double couponDiscount;
    public final double totalAmount;

    private AlarmOrder(JSONObject json) {
        this.json = json;
        this.id = json.optString("id", "");
        this.number = json.optString("number", "#" + tail(id));
        this.createdAt = parseIso(json.optString("createdAt", ""));
        this.customerName = clean(json.optString("customerName", ""), "Müşteri");
        this.phone = clean(json.optString("phone", ""), "");
        this.address = clean(json.optString("address", ""), "Belirtilmemiş");
        this.note = clean(json.optString("note", ""), "");
        this.paymentMethod = clean(json.optString("paymentMethod", ""), "Teslimatta ödeme");
        List<Item> items = new ArrayList<>();
        JSONArray array = json.optJSONArray("products");
        int count = 0;
        if (array != null) {
            for (int i = 0; i < array.length(); i++) {
                JSONObject p = array.optJSONObject(i);
                if (p == null) continue;
                int quantity = p.optInt("quantity", 0);
                double price = p.optDouble("price", 0);
                double lineTotal = p.has("lineTotal") ? p.optDouble("lineTotal", 0) : price * quantity;
                items.add(new Item(clean(p.optString("name", ""), "Ürün"), quantity, price, lineTotal));
                count += quantity;
            }
        }
        this.products = items;
        this.itemCount = json.has("itemCount") ? json.optInt("itemCount", count) : count;
        this.totalAmount = json.optDouble("totalAmount", 0);
        this.subtotalAmount = json.optDouble("subtotalAmount", totalAmount);
        String coupon = json.isNull("couponCode") ? "" : json.optString("couponCode", "");
        this.couponCode = coupon.isEmpty() ? null : coupon;
        this.couponDiscount = json.optDouble("couponDiscount", 0);
    }

    public static AlarmOrder fromJson(JSONObject json) {
        return new AlarmOrder(json);
    }

    public boolean isTest() {
        return TEST_ID.equals(id);
    }

    /** Ayarlar ekranındaki "Test alarmı" için örnek sipariş (sunucuya gitmez). */
    public static AlarmOrder sample() {
        try {
            JSONObject json = new JSONObject();
            json.put("id", TEST_ID);
            json.put("number", "#TEST");
            json.put("createdAt", formatIso(System.currentTimeMillis()));
            json.put("customerName", "Deneme Müşteri");
            json.put("phone", "");
            json.put("address", "Kız KYK Yurdu");
            json.put("note", "Bu bir deneme alarmıdır. Gerçek sipariş değildir.");
            json.put("paymentMethod", "Teslimatta ödeme");
            JSONArray products = new JSONArray();
            products.put(product("Süt 1 L", 2, 32.5));
            products.put(product("Ekmek", 1, 15));
            products.put(product("Yumurta 10'lu", 1, 85));
            json.put("products", products);
            json.put("subtotalAmount", 165);
            json.put("couponDiscount", 0);
            json.put("totalAmount", 165);
            return new AlarmOrder(json);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private static JSONObject product(String name, int quantity, double price) throws JSONException {
        JSONObject p = new JSONObject();
        p.put("name", name);
        p.put("quantity", quantity);
        p.put("price", price);
        p.put("lineTotal", quantity * price);
        return p;
    }

    private static String clean(String value, String fallback) {
        String v = value == null ? "" : value.trim();
        return v.isEmpty() || "null".equals(v) ? fallback : v;
    }

    private static String tail(String id) {
        return id.length() > 8 ? id.substring(id.length() - 8).toUpperCase(Locale.ROOT) : id.toUpperCase(Locale.ROOT);
    }

    static long parseIso(String value) {
        if (value == null || value.isEmpty()) return System.currentTimeMillis();
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.ROOT);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date date = format.parse(value);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {
                // sıradaki biçim
            }
        }
        return System.currentTimeMillis();
    }

    static String formatIso(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }
}
