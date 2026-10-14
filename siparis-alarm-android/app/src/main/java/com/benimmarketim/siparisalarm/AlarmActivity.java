package com.benimmarketim.siparisalarm;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/**
 * Yeni sipariş ekranı. Kilit ekranının üstünde açılır, ekranı uyandırır.
 * Alarm sesi serviste çalar; bu ekran kapansa da onay verilene kadar sürer.
 */
public class AlarmActivity extends Activity implements AlarmService.Listener {
    /** Sıradaki siparişe geçince yanlışlıkla iki kez basılmasın diye düğmeler kısa süre kapalı kalır. */
    private static final long BUTTON_GUARD_MS = 900;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView counter;
    private TextView number;
    private TextView time;
    private TextView total;
    private TextView customer;
    private TextView phone;
    private Button call;
    private TextView address;
    private TextView payment;
    private View noteLabel;
    private TextView waiting;
    private long shownCreatedAt;
    private TextView note;
    private TextView productsTitle;
    private LinearLayout products;
    private LinearLayout totals;
    private Button accept;
    private Button acceptAll;
    private Button seen;
    private ObjectAnimator pulse;
    private String shownId;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            render();
            handler.postDelayed(this, 30_000);
        }
    };

    /** Siparişin ne kadar süredir beklediği (saniyede bir) */
    private final Runnable clock = new Runnable() {
        @Override
        public void run() {
            if (shownCreatedAt > 0) {
                long seconds = Math.max(0, (System.currentTimeMillis() - shownCreatedAt) / 1000);
                waiting.setText(String.format(Format.TR, "Bekliyor  %02d:%02d", seconds / 60, seconds % 60));
            }
            handler.postDelayed(this, 1000);
        }
    };

    static Intent intent(Context context) {
        return new Intent(context, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        // Telefonlarda dikey; tablette yatay düzen de var (layout-sw600dp-land).
        if (getResources().getConfiguration().smallestScreenWidthDp < 600) {
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
        setContentView(R.layout.activity_alarm);
        boolean landscape = getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        View root = findViewById(R.id.root);
        Ui.edgeToEdge(this, root, landscape ? root : findViewById(R.id.header), false);
        waiting = findViewById(R.id.waiting);

        counter = findViewById(R.id.counter);
        number = findViewById(R.id.number);
        time = findViewById(R.id.time);
        total = findViewById(R.id.total);
        customer = findViewById(R.id.customer);
        phone = findViewById(R.id.phone);
        call = findViewById(R.id.call);
        address = findViewById(R.id.address);
        payment = findViewById(R.id.payment);
        noteLabel = findViewById(R.id.noteLabel);
        note = findViewById(R.id.note);
        productsTitle = findViewById(R.id.productsTitle);
        products = findViewById(R.id.products);
        totals = findViewById(R.id.totals);
        accept = findViewById(R.id.accept);
        acceptAll = findViewById(R.id.acceptAll);
        acceptAll.setOnClickListener(v -> acknowledgeAll());
        seen = findViewById(R.id.seen);

        accept.setOnClickListener(v -> acknowledge("accepted"));
        seen.setOnClickListener(v -> acknowledge("seen"));
        call.setOnClickListener(v -> callCustomer());

        ImageView bell = findViewById(R.id.bell);
        pulse = ObjectAnimator.ofPropertyValuesHolder(bell,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.08f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.08f),
                PropertyValuesHolder.ofFloat(View.ROTATION, -10f, 10f));
        pulse.setDuration(380);
        pulse.setRepeatCount(ValueAnimator.INFINITE);
        pulse.setRepeatMode(ValueAnimator.REVERSE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        AlarmService.addListener(this);
        render();
        pulse.start();
        handler.postDelayed(ticker, 30_000);
        handler.post(clock);
    }

    @Override
    protected void onPause() {
        AlarmService.removeListener(this);
        pulse.cancel();
        handler.removeCallbacks(ticker);
        handler.removeCallbacks(clock);
        super.onPause();
    }

    @Override
    public void onAlarmStateChanged() {
        render();
    }

    private AlarmOrder current() {
        List<AlarmOrder> orders = Prefs.activeOrders(this);
        return orders.isEmpty() ? null : orders.get(0);
    }

    private void render() {
        List<AlarmOrder> orders = Prefs.activeOrders(this);
        if (orders.isEmpty()) {
            finish();
            return;
        }
        AlarmOrder order = orders.get(0);
        if (!order.id.equals(shownId)) {
            boolean firstRender = shownId == null;
            shownId = order.id;
            setButtonsEnabled(false);
            handler.postDelayed(() -> setButtonsEnabled(true), firstRender ? 300 : BUTTON_GUARD_MS);
        }

        if (orders.size() > 1) {
            counter.setVisibility(View.VISIBLE);
            counter.setText("+" + (orders.size() - 1) + " sipariş daha");
            acceptAll.setVisibility(View.VISIBLE);
            acceptAll.setText("Tümünü kabul et (" + orders.size() + " sipariş)");
        } else {
            counter.setVisibility(View.GONE);
            acceptAll.setVisibility(View.GONE);
        }
        shownCreatedAt = order.createdAt;
        number.setText(order.isTest() ? "Deneme alarmı" : "Sipariş " + order.number);
        time.setText("Saat " + Format.time(order.createdAt) + "  ·  " + order.itemCount + " ürün");
        total.setText(Format.money(order.totalAmount));
        customer.setText(order.customerName);
        if (TextUtils.isEmpty(order.phone)) {
            phone.setVisibility(View.GONE);
            call.setVisibility(View.GONE);
        } else {
            phone.setVisibility(View.VISIBLE);
            call.setVisibility(View.VISIBLE);
            phone.setText(order.phone);
        }
        address.setText(order.address);
        payment.setText(order.paymentMethod);
        boolean hasNote = !TextUtils.isEmpty(order.note);
        noteLabel.setVisibility(hasNote ? View.VISIBLE : View.GONE);
        note.setText(order.note);

        productsTitle.setText("Ürünler · " + order.products.size() + " çeşit, " + order.itemCount + " adet");
        products.removeAllViews();
        for (AlarmOrder.Item item : order.products) {
            products.addView(productRow(item));
        }
        totals.removeAllViews();
        if (order.couponDiscount > 0) {
            totals.addView(totalRow("Ara toplam", Format.money(order.subtotalAmount), false));
            totals.addView(totalRow("Kupon" + (order.couponCode != null ? " (" + order.couponCode + ")" : ""),
                    "−" + Format.money(order.couponDiscount), false));
        }
        totals.addView(totalRow("Toplam", Format.money(order.totalAmount), true));
    }

    private View productRow(AlarmOrder.Item item) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        int pad = Ui.dp(this, 7);
        row.setPadding(0, pad, 0, pad);

        TextView qty = new TextView(this);
        qty.setText(item.quantity + "×");
        qty.setTextSize(16);
        qty.setTypeface(Typeface.DEFAULT_BOLD);
        qty.setTextColor(getColor(R.color.green_dark));
        qty.setGravity(Gravity.CENTER);
        qty.setBackgroundResource(R.drawable.bg_qty);
        qty.setMinWidth(Ui.dp(this, 44));
        qty.setPadding(Ui.dp(this, 6), Ui.dp(this, 4), Ui.dp(this, 6), Ui.dp(this, 4));
        LinearLayout.LayoutParams qtyParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        qtyParams.setMarginEnd(Ui.dp(this, 12));
        row.addView(qty, qtyParams);

        TextView name = new TextView(this);
        name.setText(item.name);
        name.setTextSize(16);
        name.setTextColor(getColor(R.color.ink));
        row.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView price = new TextView(this);
        price.setText(Format.money(item.lineTotal));
        price.setTextSize(15);
        price.setTextColor(getColor(R.color.ink_soft));
        price.setPadding(Ui.dp(this, 8), 0, 0, 0);
        row.addView(price);
        return row;
    }

    private View totalRow(String label, String value, boolean strong) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, Ui.dp(this, 3), 0, Ui.dp(this, 3));
        TextView left = new TextView(this);
        left.setText(label);
        left.setTextSize(strong ? 18 : 15);
        left.setTextColor(getColor(strong ? R.color.ink : R.color.muted));
        if (strong) left.setTypeface(Typeface.DEFAULT_BOLD);
        row.addView(left, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView right = new TextView(this);
        right.setText(value);
        right.setTextSize(strong ? 20 : 15);
        right.setTextColor(getColor(strong ? R.color.green_dark : R.color.ink_soft));
        if (strong) right.setTypeface(Typeface.DEFAULT_BOLD);
        row.addView(right);
        return row;
    }

    private void acknowledge(String action) {
        AlarmOrder order = current();
        if (order == null) {
            finish();
            return;
        }
        setButtonsEnabled(false);
        AlarmService.acknowledge(this, order.id, action);
        render();
    }

    private void acknowledgeAll() {
        setButtonsEnabled(false);
        for (AlarmOrder order : Prefs.activeOrders(this)) {
            AlarmService.acknowledge(this, order.id, "accepted");
        }
        render();
    }

    private void setButtonsEnabled(boolean enabled) {
        accept.setEnabled(enabled);
        seen.setEnabled(enabled);
        acceptAll.setEnabled(enabled);
    }

    private void callCustomer() {
        AlarmOrder order = current();
        if (order == null || TextUtils.isEmpty(order.phone)) return;
        Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + order.phone.replaceAll("[^0-9+]", "")));
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (keyguard != null && keyguard.isKeyguardLocked()) {
            // Arama için önce kilit açılır; alarm çalmaya devam eder.
            keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    startDial(dial);
                }
            });
        } else {
            startDial(dial);
        }
    }

    private void startDial(Intent dial) {
        try {
            startActivity(dial);
        } catch (Exception ignored) {
            // arama uygulaması yok
        }
    }
}
