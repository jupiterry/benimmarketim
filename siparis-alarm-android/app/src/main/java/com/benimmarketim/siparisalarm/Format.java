package com.benimmarketim.siparisalarm;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class Format {
    static final Locale TR = new Locale("tr", "TR");

    private Format() {
    }

    static String money(double value) {
        NumberFormat format = NumberFormat.getCurrencyInstance(TR);
        return format.format(value);
    }

    static String time(long millis) {
        return new SimpleDateFormat("HH:mm", TR).format(new Date(millis));
    }

    static String timeSeconds(long millis) {
        return new SimpleDateFormat("HH:mm:ss", TR).format(new Date(millis));
    }

    static String dateTime(long millis) {
        return new SimpleDateFormat("d MMM HH:mm", TR).format(new Date(millis));
    }

    /** "şimdi", "3 dk önce", "2 sa önce" */
    static String ago(long millis) {
        long minutes = Math.max(0, (System.currentTimeMillis() - millis) / 60000);
        if (minutes < 1) return "şimdi";
        if (minutes < 60) return minutes + " dk önce";
        return (minutes / 60) + " sa önce";
    }

    static String quantity(int quantity) {
        return quantity + " ×";
    }
}
