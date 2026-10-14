package com.benimmarketim.siparisalarm;

import android.content.Context;
import android.util.AttributeSet;
import android.widget.LinearLayout;

/**
 * Tablet ve yatay ekranda içerik ekranın tamamına yayılmasın diye genişliği sınırlar.
 * Üst öğe FrameLayout olmalı ve bu görünüm layout_gravity="center_horizontal" ile ortalanmalı.
 * Sınır: android:tag="max:640" (dp). Etiket yoksa 600 dp.
 */
public class MaxWidthLinearLayout extends LinearLayout {
    public MaxWidthLinearLayout(Context context) {
        super(context);
    }

    public MaxWidthLinearLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    private int maxWidthPx() {
        int dp = 600;
        Object tag = getTag();
        if (tag instanceof String && ((String) tag).startsWith("max:")) {
            try {
                dp = Integer.parseInt(((String) tag).substring(4).trim());
            } catch (NumberFormatException ignored) {
                // varsayılan
            }
        }
        return Ui.dp(getContext(), dp);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int size = MeasureSpec.getSize(widthMeasureSpec);
        int max = maxWidthPx();
        if (MeasureSpec.getMode(widthMeasureSpec) != MeasureSpec.UNSPECIFIED && size > max) {
            widthMeasureSpec = MeasureSpec.makeMeasureSpec(max, MeasureSpec.EXACTLY);
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
    }
}
