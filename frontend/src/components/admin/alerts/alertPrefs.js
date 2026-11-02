// Bildirim sesi tercihleri: cihaza özeldir (localStorage), panelin her yerinden aynı kaynaktan okunur.
// "notificationSound" anahtarı eskisi gibi düz metin tutulur (ör. "ringtone"); ses düzeyi, sessiz ve tekrar
// ayarları "admin-alert-prefs" içinde JSON'dur. Aynı cihazda açık diğer panel sekmeleri "storage" olayıyla eşitlenir.
import { useSyncExternalStore } from "react";
import { normalizePrefs, normalizeSound } from "./alertRules";

export const SOUND_KEY = "notificationSound";
export const PREFS_KEY = "admin-alert-prefs";
/** Başlıktaki zil panelinde ses ayarlarını açtırır (AdminHeader dinler) */
export const SOUND_SETTINGS_EVENT = "admin-sound-settings";
export const openSoundSettings = () => window.dispatchEvent(new CustomEvent(SOUND_SETTINGS_EVENT));

const read = () => {
  let sound = null;
  let prefs = null;
  try {
    sound = localStorage.getItem(SOUND_KEY);
    prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
  } catch {
    // depolama kapalı ya da kayıt bozuk: varsayılanlar
  }
  return { sound: normalizeSound(sound), ...normalizePrefs(prefs) };
};

let snapshot = read();
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export const alertPrefs = {
  get: () => snapshot,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Kısmi güncelleme: { sound?, volume?, muted?, repeat?, intervalSec? } */
  set(patch) {
    const merged = { ...snapshot, ...(patch || {}) };
    const next = { sound: normalizeSound(merged.sound), ...normalizePrefs(merged) };
    if (Object.keys(next).every((key) => next[key] === snapshot[key])) return;
    snapshot = next;
    try {
      localStorage.setItem(SOUND_KEY, next.sound);
      const { volume, muted, repeat, intervalSec } = next;
      localStorage.setItem(PREFS_KEY, JSON.stringify({ volume, muted, repeat, intervalSec }));
    } catch {
      // depolama kapalı: tercih bu oturumda geçerli kalır
    }
    emit();
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== SOUND_KEY && event.key !== PREFS_KEY) return;
    snapshot = read();
    emit();
  });
}

export const useAlertPrefs = () => useSyncExternalStore(alertPrefs.subscribe, alertPrefs.get, alertPrefs.get);
