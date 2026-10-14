package com.benimmarketim.siparisalarm;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/** Alarm sırasında arka kamera flaşını yakıp söndürür (izin gerekmez). */
final class Torch {
    private static final String TAG = "Torch";
    private static final long ON_MS = 250;
    private static final long OFF_MS = 450;

    private final CameraManager cameras;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String cameraId;
    private boolean running;
    private boolean lit;

    private final Runnable blink = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            set(!lit);
            handler.postDelayed(this, lit ? ON_MS : OFF_MS);
        }
    };

    Torch(Context context) {
        cameras = (CameraManager) context.getApplicationContext().getSystemService(Context.CAMERA_SERVICE);
        try {
            if (cameras != null) {
                for (String id : cameras.getCameraIdList()) {
                    CameraCharacteristics c = cameras.getCameraCharacteristics(id);
                    Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                    if (Boolean.TRUE.equals(flash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                        cameraId = id;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Flaş bulunamadı", e);
        }
    }

    boolean available() {
        return cameraId != null;
    }

    void start() {
        if (running || cameraId == null) return;
        running = true;
        handler.post(blink);
    }

    void stop() {
        running = false;
        handler.removeCallbacks(blink);
        if (lit) set(false);
    }

    private void set(boolean on) {
        try {
            cameras.setTorchMode(cameraId, on);
            lit = on;
        } catch (Exception e) {
            // kamera başka uygulamada açık olabilir
            lit = false;
        }
    }
}
