package com.benimmarketim.siparisalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Bugünün siparişleri: günlük özet, duruma göre süzme, sipariş ayrıntısı ve
 * telefondan "Yola çıktı" / "Teslim edildi" işaretleme (müşteriye panel ile aynı bildirim gider).
 */
public class OrdersActivity extends Activity implements AlarmService.Listener {
    private static final long REFRESH_MS = 30_000;
    private static final String ALL = "Tümü";
    private static final String[] FILTERS = {ALL, "Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"};

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> expanded = new HashSet<>();
    private LinearLayout stats;
    private LinearLayout filters;
    private LinearLayout list;
    private TextView message;
    private TextView updated;
    private View refresh;
    private ApiClient.TodayResult data;
    private String filter = ALL;
    private boolean loading;
    private int pendingCount = -1;

    private final Runnable autoRefresh = new Runnable() {
        @Override
        public void run() {
            load(false);
            handler.postDelayed(this, REFRESH_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_orders);
        Ui.edgeToEdge(this, findViewById(R.id.root), findViewById(R.id.header), true);
        stats = findViewById(R.id.stats);
        filters = findViewById(R.id.filters);
        list = findViewById(R.id.list);
        message = findViewById(R.id.message);
        updated = findViewById(R.id.updated);
        refresh = findViewById(R.id.refresh);
        findViewById(R.id.back).setOnClickListener(v -> finish());
        refresh.setOnClickListener(v -> load(true));
        renderFilters();
        message.setText("Yükleniyor…");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Prefs.isPaired(this)) {
            finish();
            return;
        }
        AlarmService.addListener(this);
        handler.post(autoRefresh);
    }

    @Override
    protected void onPause() {
        AlarmService.removeListener(this);
        handler.removeCallbacks(autoRefresh);
        super.onPause();
    }

    /** Yeni sipariş geldiğinde ya da onaylandığında liste kendiliğinden yenilenir. */
    @Override
    public void onAlarmStateChanged() {
        int count = Prefs.activeOrders(this).size();
        if (count != pendingCount) {
            pendingCount = count;
            load(false);
        }
    }

    private void load(boolean userAsked) {
        if (loading) return;
        String server = Prefs.getServer(this);
        String token = Prefs.getToken(this);
        if (token == null) return;
        loading = true;
        refresh.setEnabled(false);
        new Thread(() -> {
            try {
                ApiClient.TodayResult result = ApiClient.today(server, token);
                runOnUiThread(() -> {
                    loading = false;
                    refresh.setEnabled(true);
                    data = result;
                    updated.setText("Son güncelleme " + Format.timeSeconds(System.currentTimeMillis()));
                    render();
                });
            } catch (Exception e) {
                String text = e instanceof ApiClient.ApiException ? e.getMessage() : "Sunucuya ulaşılamadı. İnternet bağlantısını kontrol edin.";
                runOnUiThread(() -> {
                    loading = false;
                    refresh.setEnabled(true);
                    if (data == null || userAsked) {
                        message.setVisibility(View.VISIBLE);
                        message.setText(text);
                    }
                    if (userAsked) Toast.makeText(this, text, Toast.LENGTH_LONG).show();
                });
            }
        }, "bugun").start();
    }

    // ─── Görünüm ─────────────────────────────────────────────────

    private void render() {
        if (data == null) return;
        stats.removeAllViews();
        stats.addView(stat(R.drawable.ic_receipt, "Sipariş", String.valueOf(data.count), R.color.ink, R.color.green_soft, R.color.green_dark));
        stats.addView(stat(R.drawable.ic_wallet, "Ciro", Format.money(data.revenue), R.color.green_dark, R.color.green_soft, R.color.green_dark));
        boolean waiting = data.preparing + data.onTheWay > 0;
        stats.addView(stat(R.drawable.ic_truck, "Bekleyen", String.valueOf(data.preparing + data.onTheWay),
                waiting ? R.color.orange_ink : R.color.ink, waiting ? R.color.orange_soft : R.color.surface_muted, waiting ? R.color.orange_ink : R.color.muted));
        renderFilters();

        list.removeAllViews();
        List<AlarmOrder> shown = new ArrayList<>();
        for (AlarmOrder order : data.orders) {
            if (ALL.equals(filter) || filter.equals(order.status)) shown.add(order);
        }
        if (shown.isEmpty()) {
            message.setVisibility(View.VISIBLE);
            message.setText(data.orders.isEmpty() ? "Bugün henüz sipariş yok." : "Bu durumda sipariş yok.");
        } else {
            message.setVisibility(View.GONE);
        }
        for (AlarmOrder order : shown) list.addView(card(order));
    }

    private View stat(int icon, String label, String value, int colorRes, int iconBg, int iconTint) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundResource(R.drawable.bg_card);
        int pad = Ui.dp(this, 12);
        box.setPadding(pad, pad, pad, pad);
        android.widget.ImageView iconView = Ui.rowIcon(this, icon, getColor(iconBg), getColor(iconTint));
        LinearLayout.LayoutParams iconParams = (LinearLayout.LayoutParams) iconView.getLayoutParams();
        iconParams.width = Ui.dp(this, 34);
        iconParams.height = Ui.dp(this, 34);
        iconParams.bottomMargin = Ui.dp(this, 8);
        iconParams.setMarginEnd(0);
        iconView.setPadding(Ui.dp(this, 7), Ui.dp(this, 7), Ui.dp(this, 7), Ui.dp(this, 7));
        box.addView(iconView);
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(19);
        v.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        v.setTextColor(getColor(colorRes));
        v.setSingleLine(true);
        v.setEllipsize(TextUtils.TruncateAt.END);
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextSize(13);
        l.setTextColor(getColor(R.color.muted));
        box.addView(v);
        box.addView(l);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, label.equals("Ciro") ? 1.4f : 1f);
        params.setMarginEnd(label.equals("Bekleyen") ? 0 : Ui.dp(this, 8));
        box.setLayoutParams(params);
        return box;
    }

    private void renderFilters() {
        filters.removeAllViews();
        for (String name : FILTERS) {
            TextView chip = new TextView(this);
            int count = countFor(name);
            chip.setText(data == null ? name : name + " " + count);
            chip.setTextSize(14);
            chip.setTypeface(Typeface.DEFAULT_BOLD);
            boolean selected = name.equals(filter);
            GradientDrawable bg = new GradientDrawable();
            bg.setCornerRadius(Ui.dp(this, 99));
            bg.setColor(getColor(selected ? R.color.green : R.color.surface));
            bg.setStroke(Ui.dp(this, 1), getColor(selected ? R.color.green : R.color.line_strong));
            chip.setBackground(bg);
            chip.setTextColor(getColor(selected ? android.R.color.white : R.color.ink_soft));
            int h = Ui.dp(this, 14);
            chip.setPadding(h, Ui.dp(this, 8), h, Ui.dp(this, 8));
            chip.setOnClickListener(v -> {
                filter = name;
                render();
                if (data == null) renderFilters();
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.setMarginEnd(Ui.dp(this, 8));
            filters.addView(chip, params);
        }
    }

    private int countFor(String name) {
        if (data == null) return 0;
        if (ALL.equals(name)) return data.orders.size();
        int n = 0;
        for (AlarmOrder order : data.orders) if (name.equals(order.status)) n++;
        return n;
    }

    private static int[] statusColors(String status) {
        switch (status) {
            case "Yolda":
                return new int[]{R.color.blue_soft, R.color.blue};
            case "Teslim Edildi":
                return new int[]{R.color.green_soft, R.color.green_dark};
            case "İptal Edildi":
                return new int[]{R.color.red_soft, R.color.red};
            default:
                return new int[]{R.color.orange_soft, R.color.orange_ink};
        }
    }

    private View card(AlarmOrder order) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        android.graphics.drawable.GradientDrawable cardBg = new android.graphics.drawable.GradientDrawable();
        cardBg.setColor(getColor(R.color.surface));
        cardBg.setCornerRadius(Ui.dp(this, 20));
        cardBg.setStroke(Ui.dp(this, "Hazırlanıyor".equals(order.status) && order.ackAction == null ? 2 : 1),
                getColor("Hazırlanıyor".equals(order.status) && order.ackAction == null ? R.color.orange : R.color.line));
        card.setBackground(cardBg);
        card.setForeground(getDrawable(R.drawable.bg_link));
        int pad = Ui.dp(this, 14);
        card.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.topMargin = Ui.dp(this, 10);
        card.setLayoutParams(cardParams);

        // Üst satır: numara · saat ............ durum
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView number = text(order.number + "  ·  " + Format.time(order.createdAt), 16, R.color.ink, true);
        top.addView(number, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        int[] colors = statusColors(order.status);
        TextView pill = text(order.status, 13, colors[1], true);
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(Ui.dp(this, 99));
        pillBg.setColor(getColor(colors[0]));
        pill.setBackground(pillBg);
        pill.setPadding(Ui.dp(this, 10), Ui.dp(this, 3), Ui.dp(this, 10), Ui.dp(this, 3));
        top.addView(pill);
        card.addView(top);

        // Müşteri, adres, tutar
        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.HORIZONTAL);
        mid.setGravity(Gravity.CENTER_VERTICAL);
        mid.setPadding(0, Ui.dp(this, 6), 0, 0);
        LinearLayout who = new LinearLayout(this);
        who.setOrientation(LinearLayout.VERTICAL);
        who.addView(text(order.customerName, 15, R.color.ink_soft, false));
        who.addView(text(order.address + " · " + order.itemCount + " ürün", 13, R.color.muted, false));
        mid.addView(who, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        mid.addView(text(Format.money(order.totalAmount), 18, R.color.green_dark, true));
        card.addView(mid);

        if (order.ackAction != null) {
            String ack = ("accepted".equals(order.ackAction) ? "Kabul edildi" : "Görüldü")
                    + (TextUtils.isEmpty(order.ackDevice) ? "" : " · " + order.ackDevice)
                    + (order.ackAt > 0 ? " · " + Format.time(order.ackAt) : "");
            TextView ackView = text("✓ " + ack, 13, R.color.green, false);
            ackView.setPadding(0, Ui.dp(this, 4), 0, 0);
            card.addView(ackView);
        } else if ("Hazırlanıyor".equals(order.status)) {
            TextView waiting = text("Henüz onaylanmadı", 13, R.color.orange_ink, true);
            waiting.setPadding(0, Ui.dp(this, 4), 0, 0);
            card.addView(waiting);
        }

        // Ayrıntı (dokununca açılır)
        LinearLayout details = new LinearLayout(this);
        details.setOrientation(LinearLayout.VERTICAL);
        details.setPadding(0, Ui.dp(this, 10), 0, 0);
        for (AlarmOrder.Item item : order.products) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setPadding(0, Ui.dp(this, 3), 0, Ui.dp(this, 3));
            TextView qty = text(item.quantity + "×", 14, R.color.green_dark, true);
            qty.setGravity(Gravity.CENTER);
            qty.setBackgroundResource(R.drawable.bg_qty);
            qty.setMinWidth(Ui.dp(this, 38));
            qty.setPadding(Ui.dp(this, 4), Ui.dp(this, 2), Ui.dp(this, 4), Ui.dp(this, 2));
            LinearLayout.LayoutParams qp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            qp.setMarginEnd(Ui.dp(this, 10));
            row.addView(qty, qp);
            row.addView(text(item.name, 14, R.color.ink, false), new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(text(Format.money(item.lineTotal), 14, R.color.ink_soft, false));
            details.addView(row);
        }
        String extra = "Ödeme: " + order.paymentMethod
                + (order.couponDiscount > 0 ? "\nKupon" + (order.couponCode != null ? " " + order.couponCode : "") + ": −" + Format.money(order.couponDiscount) : "")
                + (TextUtils.isEmpty(order.phone) ? "" : "\nTelefon: " + order.phone)
                + (TextUtils.isEmpty(order.note) ? "" : "\nNot: " + order.note);
        TextView extraView = text(extra, 14, R.color.ink_soft, false);
        extraView.setPadding(0, Ui.dp(this, 8), 0, 0);
        details.addView(extraView);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, Ui.dp(this, 12), 0, 0);
        if (!TextUtils.isEmpty(order.phone)) {
            actions.addView(actionButton("Ara", false, v -> startDial(order.phone)));
        }
        if ("Hazırlanıyor".equals(order.status)) {
            actions.addView(actionButton("Yola çıktı", true, v -> confirmStatus(order, "Yolda")));
        }
        if ("Hazırlanıyor".equals(order.status) || "Yolda".equals(order.status)) {
            actions.addView(actionButton("Teslim edildi", true, v -> confirmStatus(order, "Teslim Edildi")));
        }
        if (actions.getChildCount() > 0) details.addView(actions);

        details.setVisibility(expanded.contains(order.id) ? View.VISIBLE : View.GONE);
        card.addView(details);
        card.setOnClickListener(v -> {
            if (expanded.remove(order.id)) {
                details.setVisibility(View.GONE);
            } else {
                expanded.add(order.id);
                details.setVisibility(View.VISIBLE);
            }
        });
        return card;
    }

    private TextView text(String value, float size, int colorRes, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(getColor(colorRes));
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private Button actionButton(String label, boolean primary, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setStateListAnimator(null);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(Ui.dp(this, 10), 0, Ui.dp(this, 10), 0);
        button.setBackgroundResource(primary ? R.drawable.bg_button_primary : R.drawable.bg_button_call);
        button.setTextColor(getColor(primary ? android.R.color.white : R.color.green_dark));
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, Ui.dp(this, 44), 1f);
        params.setMarginEnd(Ui.dp(this, 8));
        button.setLayoutParams(params);
        return button;
    }

    // ─── İşlemler ────────────────────────────────────────────────

    private void confirmStatus(AlarmOrder order, String status) {
        String label = "Yolda".equals(status) ? "yola çıktı" : "teslim edildi";
        new AlertDialog.Builder(this)
                .setTitle(order.number + " " + label + " olarak işaretlensin mi?")
                .setMessage(order.customerName + " · " + Format.money(order.totalAmount)
                        + "\nMüşteriye bildirim gider. Geri almak için yönetim panelini kullanın.")
                .setNegativeButton("Vazgeç", null)
                .setPositiveButton("Evet, işaretle", (d, w) -> changeStatus(order, status, label))
                .show();
    }

    private void changeStatus(AlarmOrder order, String status, String label) {
        String server = Prefs.getServer(this);
        String token = Prefs.getToken(this);
        if (token == null) return;
        new Thread(() -> {
            try {
                ApiClient.changeStatus(server, token, order.id, status);
                runOnUiThread(() -> {
                    Toast.makeText(this, order.number + " " + label + " olarak işaretlendi.", Toast.LENGTH_SHORT).show();
                    load(false);
                });
            } catch (Exception e) {
                String text = e instanceof ApiClient.ApiException ? e.getMessage() : "Sunucuya ulaşılamadı. Tekrar deneyin.";
                runOnUiThread(() -> {
                    Toast.makeText(this, text, Toast.LENGTH_LONG).show();
                    load(false);
                });
            }
        }, "durum").start();
    }

    private void startDial(String phone) {
        try {
            startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone.replaceAll("[^0-9+]", ""))));
        } catch (Exception ignored) {
            // arama uygulaması yok
        }
    }
}
