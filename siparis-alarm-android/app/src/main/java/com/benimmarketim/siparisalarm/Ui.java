package com.benimmarketim.siparisalarm;

import android.app.Activity;
import android.content.Context;
import android.graphics.Insets;
import android.os.Build;
import android.util.TypedValue;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

final class Ui {
    private Ui() {
    }

    /** Kalın başlık + altında küçük, soluk açıklama (anahtar ve satır metinleri için). */
    static CharSequence twoLine(Context context, String title, String subtitle) {
        android.text.SpannableStringBuilder text = new android.text.SpannableStringBuilder(title);
        if (subtitle != null && !subtitle.isEmpty()) {
            int start = text.length();
            text.append('\n').append(subtitle);
            text.setSpan(new android.text.style.RelativeSizeSpan(0.85f), start, text.length(), 0);
            text.setSpan(new android.text.style.ForegroundColorSpan(context.getColor(R.color.muted)), start, text.length(), 0);
        }
        return text;
    }

    /** Satır başı ikonu: yuvarlak köşeli renkli kutu içinde. */
    static android.widget.ImageView rowIcon(Context context, int icon, int backgroundColor, int tintColor) {
        android.widget.ImageView view = new android.widget.ImageView(context);
        view.setImageResource(icon);
        view.setImageTintList(android.content.res.ColorStateList.valueOf(tintColor));
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setCornerRadius(dp(context, 12));
        bg.setColor(backgroundColor);
        view.setBackground(bg);
        int pad = dp(context, 9);
        view.setPadding(pad, pad, pad, pad);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        android.widget.LinearLayout.LayoutParams params = new android.widget.LinearLayout.LayoutParams(dp(context, 40), dp(context, 40));
        params.setMarginEnd(dp(context, 12));
        view.setLayoutParams(params);
        return view;
    }

    static int dp(Context context, float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }

    /**
     * İçerik durum ve gezinme çubuklarının altına uzanır (Android 15 bunu zorunlu kılar);
     * üst bölüm durum çubuğu kadar, kök görünüm alt çubuk/klavye kadar iç boşluk alır.
     */
    @SuppressWarnings("deprecation")
    static void edgeToEdge(Activity activity, View root, View top, boolean lightNavigation) {
        Window window = activity.getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // Üst bölüm koyu yeşil: durum çubuğu simgeleri açık renk kalır.
                controller.setSystemBarsAppearance(
                        lightNavigation ? WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS : 0,
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS | WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (lightNavigation && Build.VERSION.SDK_INT >= 27) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            root.setSystemUiVisibility(flags);
        }
        final int topStart = top.getPaddingTop();
        final int bottomStart = root.getPaddingBottom();
        final int leftStart = root.getPaddingLeft();
        final int rightStart = root.getPaddingRight();
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int l;
            int t;
            int r;
            int b;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                l = bars.left;
                t = bars.top;
                r = bars.right;
                b = Math.max(bars.bottom, ime.bottom);
            } else {
                l = insets.getSystemWindowInsetLeft();
                t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight();
                b = insets.getSystemWindowInsetBottom();
            }
            top.setPadding(top.getPaddingLeft(), topStart + t, top.getPaddingRight(), top.getPaddingBottom());
            root.setPadding(leftStart + l, root.getPaddingTop(), rightStart + r, bottomStart + b);
            return insets;
        });
        root.requestApplyInsets();
    }
}
