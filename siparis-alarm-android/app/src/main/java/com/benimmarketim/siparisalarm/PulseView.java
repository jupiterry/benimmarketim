package com.benimmarketim.siparisalarm;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * Dışa doğru yayılan halkalar (gelen arama ekranlarındaki gibi).
 * android:tag="dot" ise ortada dolu bir nokta da çizer (durum göstergesi).
 */
public class PulseView extends View {
    private static final int RINGS = 3;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
    private int color = 0xFFB8E36F;
    private boolean animate = true;

    public PulseView(Context context) {
        this(context, null);
    }

    public PulseView(Context context, AttributeSet attrs) {
        super(context, attrs);
        animator.setDuration(1800);
        animator.setRepeatCount(ValueAnimator.INFINITE);
        animator.setInterpolator(new LinearInterpolator());
        animator.addUpdateListener(a -> invalidate());
    }

    public void setColor(int color) {
        this.color = color;
        invalidate();
    }

    /** Bağlantı yokken halkalar durur, yalnızca nokta görünür. */
    public void setAnimating(boolean value) {
        if (animate == value) return;
        animate = value;
        if (value && isAttachedToWindow()) animator.start();
        if (!value) animator.cancel();
        invalidate();
    }

    private boolean hasDot() {
        return "dot".equals(getTag());
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (animate) animator.start();
    }

    @Override
    protected void onDetachedFromWindow() {
        animator.cancel();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        float max = Math.min(cx, cy);
        float min = max * (hasDot() ? 0.40f : 0.42f);
        Object value = animator.getAnimatedValue();
        float t = animate && value instanceof Float ? (Float) value : 0f;
        paint.setStyle(Paint.Style.FILL);
        if (animate) {
            for (int i = 0; i < RINGS; i++) {
                float p = (t + i / (float) RINGS) % 1f;
                float r = min + (max - min) * p;
                int alpha = (int) ((1f - p) * (hasDot() ? 90 : 110));
                paint.setColor((color & 0x00FFFFFF) | (alpha << 24));
                canvas.drawCircle(cx, cy, r, paint);
            }
        }
        if (hasDot()) {
            paint.setColor(color);
            canvas.drawCircle(cx, cy, min, paint);
        }
    }
}
