package com.benimmarketim.siparisalarm;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Eşleme (giriş) ve durum/izin ekranı. */
public class MainActivity extends Activity implements AlarmService.Listener {
    private static final int REQ_NOTIFICATIONS = 1;
    private static final int REQ_SOUND = 2;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private View loginSection;
    private View dashboardSection;
    private EditText email;
    private EditText password;
    private EditText deviceName;
    private EditText server;
    private TextView loginError;
    private Button loginButton;

    private PulseView statusDot;
    private View statusCard;
    private TextView deviceChip;
    private TextView permissionCount;
    private android.widget.ProgressBar permissionProgress;
    private boolean passwordVisible;
    private TextView statusTitle;
    private TextView statusDetail;
    private TextView deviceLine;
    private View pendingCard;
    private TextView pendingText;
    private TextView permissionSummary;
    private LinearLayout permissions;
    private TextView soundName;
    private Switch maxVolume;
    private Switch vibrate;
    private Switch speak;
    private Switch flash;
    private TextView speakNote;
    private LinearLayout history;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (Prefs.isPaired(MainActivity.this)) renderStatus();
            handler.postDelayed(this, 5000);
        }
    };

    /** Bir ayar satırı: durum kontrolü + düzeltme düğmesi */
    private static final class Check {
        final String title;
        final String detail;
        final boolean ok;
        final boolean required;
        final String button;
        final Runnable fix;

        Check(String title, String detail, boolean ok, boolean required, String button, Runnable fix) {
            this.title = title;
            this.detail = detail;
            this.ok = ok;
            this.required = required;
            this.button = button;
            this.fix = fix;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        Ui.edgeToEdge(this, findViewById(R.id.root), findViewById(R.id.header), true);

        loginSection = findViewById(R.id.loginSection);
        dashboardSection = findViewById(R.id.dashboardSection);
        email = findViewById(R.id.email);
        password = findViewById(R.id.password);
        deviceName = findViewById(R.id.deviceName);
        server = findViewById(R.id.server);
        loginError = findViewById(R.id.loginError);
        loginButton = findViewById(R.id.loginButton);
        statusDot = findViewById(R.id.statusDot);
        statusCard = findViewById(R.id.statusCard);
        deviceChip = findViewById(R.id.deviceChip);
        permissionCount = findViewById(R.id.permissionCount);
        permissionProgress = findViewById(R.id.permissionProgress);
        ((PulseView) findViewById(R.id.loginPulse)).setColor(getColor(R.color.green));
        findViewById(R.id.passwordToggle).setOnClickListener(v -> togglePassword());
        statusTitle = findViewById(R.id.statusTitle);
        statusDetail = findViewById(R.id.statusDetail);
        deviceLine = findViewById(R.id.deviceLine);
        pendingCard = findViewById(R.id.pendingCard);
        pendingText = findViewById(R.id.pendingText);
        permissionSummary = findViewById(R.id.permissionSummary);
        permissions = findViewById(R.id.permissions);
        soundName = findViewById(R.id.soundName);
        maxVolume = findViewById(R.id.maxVolume);
        vibrate = findViewById(R.id.vibrate);
        speak = findViewById(R.id.speak);
        flash = findViewById(R.id.flash);
        speakNote = findViewById(R.id.speakNote);
        history = findViewById(R.id.history);

        server.setText(Prefs.getServer(this));
        deviceName.setText(defaultDeviceName());
        findViewById(R.id.serverToggle).setOnClickListener(v -> server.setVisibility(server.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        loginButton.setOnClickListener(v -> pair());
        findViewById(R.id.openAlarm).setOnClickListener(v -> startActivity(AlarmActivity.intent(this)));
        findViewById(R.id.changeSound).setOnClickListener(v -> chooseSound());
        findViewById(R.id.testAlarm).setOnClickListener(v -> testAlarm());
        findViewById(R.id.logout).setOnClickListener(v -> confirmLogout());
        maxVolume.setOnCheckedChangeListener((b, checked) -> Prefs.setMaxVolume(this, checked));
        vibrate.setOnCheckedChangeListener((b, checked) -> Prefs.setVibrate(this, checked));
        speak.setOnCheckedChangeListener((b, checked) -> {
            Prefs.setSpeak(this, checked);
            if (checked) Announcer.get(this).warmUp();
            handler.postDelayed(this::renderSpeakNote, 1500);
        });
        flash.setOnCheckedChangeListener((b, checked) -> Prefs.setFlash(this, checked));
        maxVolumeLabel();
        if (!new Torch(this).available()) {
            flash.setEnabled(false);
            flash.setText(Ui.twoLine(this, "Flaş ışığı", "Bu telefonda flaş yok"));
        }
        findViewById(R.id.todayOrders).setOnClickListener(v -> startActivity(new Intent(this, OrdersActivity.class)));
        ((TextView) findViewById(R.id.version)).setText("Sürüm " + BuildInfo.VERSION_NAME + " · Benim Marketim");
    }

    @Override
    protected void onResume() {
        super.onResume();
        AlarmService.addListener(this);
        if (Prefs.isPaired(this)) AlarmService.start(this);
        render();
        handler.postDelayed(ticker, 5000);
    }

    @Override
    protected void onPause() {
        AlarmService.removeListener(this);
        handler.removeCallbacks(ticker);
        super.onPause();
    }

    @Override
    public void onAlarmStateChanged() {
        if (Prefs.isPaired(this)) {
            renderStatus();
            renderHistory();
        } else {
            render();
        }
    }

    private void render() {
        boolean paired = Prefs.isPaired(this);
        loginSection.setVisibility(paired ? View.GONE : View.VISIBLE);
        dashboardSection.setVisibility(paired ? View.VISIBLE : View.GONE);
        deviceChip.setVisibility(paired ? View.VISIBLE : View.GONE);
        if (!paired) return;
        deviceChip.setText(Prefs.getDeviceName(this));
        renderStatus();
        renderPermissions();
        soundName.setText(AlarmSound.soundName(this));
        maxVolume.setChecked(Prefs.maxVolume(this));
        vibrate.setChecked(Prefs.vibrate(this));
        speak.setChecked(Prefs.speak(this));
        flash.setChecked(Prefs.flash(this));
        if (Prefs.speak(this)) Announcer.get(this).warmUp();
        renderSpeakNote();
        renderHistory();
    }

    private void renderSpeakNote() {
        Announcer.State state = Announcer.get(this).state();
        if (Prefs.speak(this) && state == Announcer.State.NO_TURKISH) {
            speakNote.setVisibility(View.VISIBLE);
            speakNote.setText("Telefonda Türkçe okuma sesi yüklü değil. Ayarlar > Erişilebilirlik > Metin okuma çıkışı'ndan Türkçe ses paketini indirin.");
        } else if (Prefs.speak(this) && state == Announcer.State.FAILED) {
            speakNote.setVisibility(View.VISIBLE);
            speakNote.setText("Telefonun metin okuma motoru açılamadı. Alarm sesli okuma olmadan çalar.");
        } else {
            speakNote.setVisibility(View.GONE);
        }
    }

    // ─── Eşleme ──────────────────────────────────────────────────

    private static String defaultDeviceName() {
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        if (!model.toLowerCase(Locale.ROOT).startsWith(maker.toLowerCase(Locale.ROOT)) && !maker.isEmpty()) {
            model = maker.substring(0, 1).toUpperCase(Locale.ROOT) + maker.substring(1) + " " + model;
        }
        return model.length() > 40 ? model.substring(0, 40) : model;
    }

    private void pair() {
        String mail = email.getText().toString().trim();
        String pass = password.getText().toString();
        String name = deviceName.getText().toString().trim();
        String url = ApiClient.normalizeServer(server.getText().toString());
        if (mail.isEmpty() || pass.isEmpty()) {
            showLoginError("E-posta ve şifreyi girin.");
            return;
        }
        if (name.isEmpty()) name = defaultDeviceName();
        hideKeyboard();
        loginError.setVisibility(View.GONE);
        loginButton.setEnabled(false);
        loginButton.setText("Bağlanılıyor…");
        final String finalName = name;
        new Thread(() -> {
            try {
                ApiClient.PairResult result = ApiClient.pair(url, mail, pass, finalName);
                runOnUiThread(() -> {
                    Prefs.savePairing(this, url, result.token, result.deviceName, result.adminName);
                    password.setText("");
                    loginButton.setEnabled(true);
                    loginButton.setText("Giriş yap ve alarmı aç");
                    Watchdog.schedule(this);
                    AlarmService.start(this);
                    render();
                    askFirstPermissions();
                });
            } catch (Exception e) {
                String message = e instanceof ApiClient.ApiException ? e.getMessage()
                        : "Sunucuya bağlanılamadı. İnternet bağlantısını ve sunucu adresini kontrol edin.";
                runOnUiThread(() -> {
                    loginButton.setEnabled(true);
                    loginButton.setText("Giriş yap ve alarmı aç");
                    showLoginError(message);
                });
            }
        }, "eslestir").start();
    }

    private void showLoginError(String message) {
        loginError.setText(message);
        loginError.setVisibility(View.VISIBLE);
    }

    private void hideKeyboard() {
        InputMethodManager imm = getSystemService(InputMethodManager.class);
        View focus = getCurrentFocus();
        if (imm != null && focus != null) imm.hideSoftInputFromWindow(focus.getWindowToken(), 0);
    }

    /** İlk girişte bildirim izni hemen istenir; kalanlar listeden tek tek açılır. */
    private void askFirstPermissions() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Prefs.setPermissionsAsked(this);
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] perms, int[] results) {
        super.onRequestPermissionsResult(requestCode, perms, results);
        render();
    }

    // ─── Durum ───────────────────────────────────────────────────

    private void renderStatus() {
        boolean running = AlarmService.isRunning();
        boolean connected = AlarmService.isConnected();
        long last = Prefs.lastSuccess(this);
        int[] gradient;
        int dotColor;
        if (running && connected) {
            gradient = new int[]{getColor(R.color.green), getColor(R.color.green_dark)};
            dotColor = getColor(R.color.lime);
            statusTitle.setText("Alarm açık");
            statusDetail.setText("Siparişler dinleniyor · son kontrol " + Format.timeSeconds(last)
                    + "\nUygulamayı kapatsanız da yeni siparişte telefon çalar.");
        } else if (running) {
            gradient = new int[]{0xFFE58A2E, 0xFFB86414};
            dotColor = android.graphics.Color.WHITE;
            statusTitle.setText("Bağlantı bekleniyor");
            String error = AlarmService.lastError();
            statusDetail.setText((TextUtils.isEmpty(error) ? "Sunucuya bağlanılıyor…" : error)
                    + (last > 0 ? "\nSon başarılı kontrol: " + Format.dateTime(last) : ""));
        } else {
            gradient = new int[]{getColor(R.color.red), 0xFFA52626};
            dotColor = android.graphics.Color.WHITE;
            statusTitle.setText("Alarm kapalı");
            statusDetail.setText("Servis çalışmıyor. Aşağıdaki ayarları tamamlayın; uygulama açıldığında yeniden başlar.");
        }
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, gradient);
        bg.setCornerRadius(Ui.dp(this, 24));
        statusCard.setBackground(bg);
        statusDot.setColor(dotColor);
        statusDot.setAnimating(running && connected);

        String admin = Prefs.getAdminName(this);
        deviceLine.setText("Bu telefon: " + Prefs.getDeviceName(this)
                + (admin.isEmpty() ? "" : " · Eşleyen: " + admin)
                + "\nSunucu: " + Prefs.getServer(this).replace("https://", ""));

        List<AlarmOrder> active = Prefs.activeOrders(this);
        if (active.isEmpty()) {
            pendingCard.setVisibility(View.GONE);
        } else {
            pendingCard.setVisibility(View.VISIBLE);
            pendingText.setText(active.size() == 1 ? "1 sipariş onay bekliyor" : active.size() + " sipariş onay bekliyor");
        }
    }

    private void renderHistory() {
        history.removeAllViews();
        List<JSONObject> items = Prefs.history(this);
        if (items.isEmpty()) {
            history.addView(bodyText("Henüz onay yok. Gelen siparişlere verdiğiniz yanıtlar burada görünür.", R.color.muted));
            return;
        }
        for (int i = 0; i < items.size(); i++) {
            JSONObject item = items.get(i);
            boolean accepted = "accepted".equals(item.optString("action"));
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, Ui.dp(this, i == 0 ? 0 : 10), 0, 0);
            row.addView(Ui.rowIcon(this, accepted ? R.drawable.ic_check_circle : R.drawable.ic_visibility,
                    getColor(accepted ? R.color.green_soft : R.color.surface_muted),
                    getColor(accepted ? R.color.green : R.color.muted)));
            TextView text = new TextView(this);
            text.setTextSize(15);
            text.setTextColor(getColor(R.color.ink));
            text.setText(Ui.twoLine(this, item.optString("number") + " · " + item.optString("customer"),
                    (accepted ? "Kabul edildi" : "Görüldü") + " · " + Format.dateTime(item.optLong("at"))));
            row.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            TextView total = new TextView(this);
            total.setText(Format.money(item.optDouble("total", 0)));
            total.setTextSize(15);
            total.setTypeface(Typeface.DEFAULT_BOLD);
            total.setTextColor(getColor(R.color.green_dark));
            row.addView(total);
            history.addView(row);
        }
    }

    private TextView bodyText(String value, int colorRes) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(14);
        text.setTextColor(getColor(colorRes));
        return text;
    }

    // ─── İzinler ve telefon ayarları ─────────────────────────────

    private List<Check> checks() {
        List<Check> list = new ArrayList<>();
        String pkg = getPackageName();
        NotificationManager nm = getSystemService(NotificationManager.class);

        boolean notifPermission = Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean notifEnabled = nm != null && nm.areNotificationsEnabled();
        NotificationChannel channel = nm != null ? nm.getNotificationChannel(Notifications.CH_ALARM) : null;
        boolean channelOk = channel == null || channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
        list.add(new Check("Bildirimler",
                "Kilit ekranında sipariş ekranının açılması için gerekli.",
                notifPermission && notifEnabled && channelOk, true, "İzin ver", () -> {
            if (Build.VERSION.SDK_INT >= 33 && !notifPermission && !Prefs.permissionsAsked(this)) {
                askFirstPermissions();
            } else if (notifEnabled && !channelOk) {
                open(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, Notifications.CH_ALARM));
            } else {
                open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg));
            }
        }));

        if (Build.VERSION.SDK_INT >= 34) {
            boolean fsi = nm != null && nm.canUseFullScreenIntent();
            list.add(new Check("Tam ekran uyarı",
                    "Telefon kilitliyken siparişin gelen arama gibi tam ekran açılması.",
                    fsi, true, "Aç", () -> open(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg)))));
        }

        PowerManager pm = getSystemService(PowerManager.class);
        boolean battery = pm != null && pm.isIgnoringBatteryOptimizations(pkg);
        list.add(new Check("Pil optimizasyonu kapalı",
                "Android uygulamayı uyutmasın; ekran kapalıyken de sipariş gelsin.",
                battery, true, "Kapat", () -> {
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)));
            } catch (ActivityNotFoundException e) {
                open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
        }));

        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = getSystemService(AlarmManager.class);
            boolean exact = am != null && am.canScheduleExactAlarms();
            if (!exact) {
                list.add(new Check("Alarm ve hatırlatıcılar",
                        "Uygulama kapanırsa kendini zamanında yeniden başlatabilsin.",
                        false, true, "İzin ver", () -> open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg)))));
            }
        }

        boolean overlay = Settings.canDrawOverlays(this);
        list.add(new Check("Diğer uygulamaların üzerinde göster",
                "Önerilir: telefon açıkken ve başka uygulama kullanılırken de sipariş ekranı hemen açılır.",
                overlay, false, "İzin ver", () -> open(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + pkg)))));

        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm != null && cm.getRestrictBackgroundStatus() == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED) {
            list.add(new Check("Veri tasarrufu",
                    "Veri tasarrufu açık: mobil veride arka plan bağlantısı engellenebilir. Bu uygulamaya sınırsız veri izni verin.",
                    false, true, "Ayarla", () -> open(new Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS, Uri.parse("package:" + pkg)))));
        }

        if (!Prefs.maxVolume(this)) {
            AudioManager audio = getSystemService(AudioManager.class);
            if (audio != null && audio.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
                list.add(new Check("Alarm sesi kısık",
                        "Alarm ses seviyesi sıfır. \"Sesi en yükseğe çıkar\" seçeneğini açın.",
                        false, true, "Aç", () -> {
                    Prefs.setMaxVolume(this, true);
                    render();
                }));
            }
        }

        String vendorHint = vendorHint();
        if (vendorHint != null) {
            list.add(new Check(Build.MANUFACTURER.substring(0, 1).toUpperCase(Locale.ROOT) + Build.MANUFACTURER.substring(1) + " ayarları",
                    vendorHint, true, false, "Uygulama ayarları",
                    () -> open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)))));
        }
        return list;
    }

    /** Bazı üreticiler arka plan uygulamalarını ek ayarlarla kapatır; Android'in izinleri yetmez. */
    private static String vendorHint() {
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        if (maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco")) {
            return "Uygulama ayarlarında: Otomatik başlatma açık, Pil tasarrufu \"Kısıtlama yok\", Diğer izinler > \"Kilit ekranında göster\" ve \"Arka planda açılır pencereler\" izinli olsun.";
        }
        if (maker.contains("huawei") || maker.contains("honor")) {
            return "Ayarlar > Pil > Uygulama başlatma: bu uygulamayı \"Manuel yönet\" yapıp üç seçeneği de açın.";
        }
        if (maker.contains("oppo") || maker.contains("realme") || maker.contains("oneplus")) {
            return "Uygulama ayarlarında: Otomatik başlatma açık, Pil > \"Arka planda etkinliğe izin ver\" açık olsun.";
        }
        if (maker.contains("vivo") || maker.contains("iqoo")) {
            return "i Yönetici / Pil: arka planda yüksek güç kullanımına ve otomatik başlatmaya izin verin.";
        }
        if (maker.contains("samsung")) {
            return "Uygulama ayarları > Pil: \"Kısıtlanmamış\" seçin. Uyuyan uygulamalar listesinde olmadığından emin olun.";
        }
        return null;
    }

    private void renderPermissions() {
        permissions.removeAllViews();
        int missing = 0;
        int required = 0;
        for (Check check : checks()) {
            if (check.required) required++;
            if (check.required && !check.ok) missing++;
            permissions.addView(checkRow(check));
        }
        permissionCount.setText((required - missing) + "/" + required + " tamam");
        permissionCount.setBackgroundResource(missing == 0 ? R.drawable.bg_pill_green_soft : R.drawable.bg_pill_red_soft);
        permissionCount.setTextColor(getColor(missing == 0 ? R.color.green_dark : R.color.red));
        permissionProgress.setMax(Math.max(1, required));
        permissionProgress.setProgress(required - missing);
        if (missing == 0) {
            permissionSummary.setText("Gerekli ayarlar tamam. Telefonu şarjda ve internete bağlı tutmanız yeterli.");
            permissionSummary.setTextColor(getColor(R.color.green_dark));
        } else {
            permissionSummary.setText(missing + " ayar eksik. Eksik ayarlar varken alarm kilit ekranında ya da uygulama kapalıyken gecikebilir.");
            permissionSummary.setTextColor(getColor(R.color.red));
        }
    }

    private View checkRow(Check check) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Ui.dp(this, 14), 0, 0);

        int icon;
        int bg;
        int tint;
        if (check.ok && check.required) {
            icon = R.drawable.ic_check_circle;
            bg = R.color.green_soft;
            tint = R.color.green;
        } else if (check.required) {
            icon = R.drawable.ic_error;
            bg = R.color.red_soft;
            tint = R.color.red;
        } else {
            icon = R.drawable.ic_info;
            bg = R.color.orange_soft;
            tint = R.color.orange_ink;
        }
        row.addView(Ui.rowIcon(this, icon, getColor(bg), getColor(tint)));

        TextView texts = new TextView(this);
        texts.setTextSize(15);
        texts.setTextColor(getColor(R.color.ink));
        texts.setText(Ui.twoLine(this, check.title, check.detail));
        row.addView(texts, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        boolean actionable = !check.ok || !check.required;
        if (actionable && check.fix != null) {
            Button button = new Button(this);
            button.setText(check.button);
            button.setAllCaps(false);
            button.setTextSize(13);
            button.setTypeface(Typeface.DEFAULT_BOLD);
            button.setStateListAnimator(null);
            button.setMinWidth(0);
            button.setMinimumWidth(0);
            button.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 12), 0);
            boolean primary = !check.ok;
            button.setBackgroundResource(primary ? R.drawable.bg_button_primary : R.drawable.bg_button_call);
            button.setTextColor(getColor(primary ? android.R.color.white : R.color.green_dark));
            button.setOnClickListener(v -> check.fix.run());
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, Ui.dp(this, 38));
            params.setMarginStart(Ui.dp(this, 8));
            row.addView(button, params);
        }
        return row;
    }

    private void togglePassword() {
        passwordVisible = !passwordVisible;
        int selection = password.getSelectionEnd();
        password.setInputType(android.text.InputType.TYPE_CLASS_TEXT | (passwordVisible
                ? android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                : android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD));
        password.setTypeface(Typeface.DEFAULT);
        password.setSelection(Math.max(0, Math.min(selection, password.length())));
        ((android.widget.ImageView) findViewById(R.id.passwordToggle)).setImageTintList(
                android.content.res.ColorStateList.valueOf(getColor(passwordVisible ? R.color.green : R.color.subtle)));
    }

    /** Anahtarların altına küçük açıklama satırı */
    private void maxVolumeLabel() {
        maxVolume.setText(Ui.twoLine(this, "Sesi en yükseğe çıkar", "Sessiz modda da çalar; kısılırsa yeniden açılır"));
        vibrate.setText(Ui.twoLine(this, "Titreşim", "Alarm boyunca tekrarlanır"));
        speak.setText(Ui.twoLine(this, "Siparişi sesli oku", "Adres, ürün sayısı ve tutar okunur"));
        flash.setText(Ui.twoLine(this, "Flaş ışığı yanıp sönsün", "Gürültülü ortamlar için"));
    }

    private void open(Intent intent) {
        try {
            startActivity(intent);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) {
                Toast.makeText(this, "Ayar ekranı açılamadı. Telefon ayarlarından uygulamayı bulun.", Toast.LENGTH_LONG).show();
            }
        }
    }

    // ─── Alarm ayarları ──────────────────────────────────────────

    private void chooseSound() {
        String[] options = {"Telefonun zil sesi (önerilen)", "Benim Marketim zil sesi", "Başka bir ses seç…"};
        new AlertDialog.Builder(this)
                .setTitle("Alarm sesi")
                .setItems(options, (dialog, which) -> {
                    if (which == 0) {
                        Prefs.setSoundUri(this, null);
                        render();
                    } else if (which == 1) {
                        Prefs.setSoundUri(this, AlarmSound.APP_SOUND);
                        render();
                    } else {
                        Intent picker = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_RINGTONE | RingtoneManager.TYPE_ALARM)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Sipariş alarmı sesi")
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, AlarmSound.chosenUri(this));
                        try {
                            startActivityForResult(picker, REQ_SOUND);
                        } catch (ActivityNotFoundException e) {
                            Toast.makeText(this, "Bu telefonda ses seçici yok.", Toast.LENGTH_LONG).show();
                        }
                    }
                })
                .show();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SOUND && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            Prefs.setSoundUri(this, uri != null ? uri.toString() : null);
            render();
        }
    }

    private void testAlarm() {
        AlarmService.startTest(this);
        Toast.makeText(this, "Test alarmı 10 saniye sonra çalacak. İsterseniz şimdi telefonu kilitleyin.", Toast.LENGTH_LONG).show();
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle("Çıkış yapılsın mı?")
                .setMessage("Bu telefonda sipariş alarmı kapanır ve telefonun eşlemesi sunucudan silinir. Tekrar kullanmak için yeniden giriş yapmanız gerekir.")
                .setNegativeButton("Vazgeç", null)
                .setPositiveButton("Çıkış yap", (dialog, which) -> logout())
                .show();
    }

    private void logout() {
        String url = Prefs.getServer(this);
        String token = Prefs.getToken(this);
        Prefs.clearPairing(this);
        AlarmService.shutdown(this);
        render();
        if (token != null) {
            new Thread(() -> {
                try {
                    ApiClient.logout(url, token);
                } catch (Exception ignored) {
                    // Sunucuya ulaşılamazsa eşleme panelden kaldırılabilir.
                }
            }, "cikis").start();
        }
    }
}
