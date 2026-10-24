// Ürün verisinden üretilen tüm sunucu önbelleklerinin ortak geçersiz kılma noktası.
//
// Önbellekler süreç içindedir (ürün listesi yanıtları, ana sayfa katalog/raf önbellekleri,
// haftalık fiyat haritası). PM2 cluster'da her süreç kendi kopyasını tutar; bu yüzden
// invalidateProductCaches() yerel önbellekleri hemen temizler VE Redis'teki sürüm anahtarını
// değiştirir. Diğer süreçler önbellekli uç noktaların başında syncProductCacheVersion() ile
// sürümü (en sık 3 sn'de bir) okur ve değiştiyse kendi önbelleklerini atar.
//
// Önbellek sahipleri temizleme fonksiyonlarını onProductCachesInvalidated() ile kaydeder;
// bu dosya hiçbir controller/servisi import etmez (döngüsel bağımlılık olmaz).
import { redis } from "../lib/redis.js";

const VERSION_KEY = "products:cache-version";
// Hiçbir yerde okunmayan eski anahtar; yine de bayat kalmasın
const LEGACY_FEATURED_KEY = "featured_products";
export const VERSION_CHECK_MS = 3000;
const REDIS_TIMEOUT_MS = 300;

const clearers = new Set();
let seenVersion = null;
let lastCheckAt = 0;
let lastInvalidatedAt = 0;
let pendingWrite = null;

// Redis yanıt vermezse istek beklemez: süre dolunca undefined döner
const withTimeout = (promise, ms = REDIS_TIMEOUT_MS) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, undefined);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
};

const stampOf = (version) => {
  const ms = Number.parseInt(String(version || "").split("-")[0], 10);
  return Number.isFinite(ms) ? ms : 0;
};

/** Önbellek sahibi, ürünler değişince çağrılacak temizleme fonksiyonunu kaydeder. */
export const onProductCachesInvalidated = (fn) => {
  clearers.add(fn);
  return () => clearers.delete(fn);
};

const clearLocal = () => {
  for (const fn of clearers) {
    try {
      fn();
    } catch (error) {
      console.error("Ürün önbelleği temizlenemedi:", error.message);
    }
  }
};

/**
 * Ürün fiyatı/görünürlüğü/kampanyası değiştiğinde çağrılır. Yerel önbellekler senkron temizlenir;
 * Redis sürümü aynı tik içindeki çağrılar için tek kez yazılır. Asla hata fırlatmaz.
 */
export const invalidateProductCaches = () => {
  clearLocal();
  const now = Date.now();
  lastInvalidatedAt = Math.max(lastInvalidatedAt, now);
  seenVersion = `${now}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  if (pendingWrite) return pendingWrite;
  // Yazma sürerken yeni bir geçersiz kılma gelirse en son sürüm de yazılır
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      const written = seenVersion;
      try {
        await withTimeout(Promise.all([
          redis.set(VERSION_KEY, written, "EX", 7 * 24 * 60 * 60),
          redis.del(LEGACY_FEATURED_KEY),
        ]));
      } catch {
        /* Redis yoksa yalnızca yerel önbellekler temizlenir */
      }
      if (written === seenVersion) return;
    }
  };
  pendingWrite = Promise.resolve().then(flush).finally(() => { pendingWrite = null; });
  return pendingWrite;
};

/**
 * Başka bir süreç ürünleri değiştirdiyse yerel önbellekleri atar. Önbellekli uç noktaların
 * başında çağrılır; Redis en sık VERSION_CHECK_MS'de bir okunur, yanıt gelmezse istek beklemez.
 * @returns {Promise<boolean>} yerel önbellek temizlendiyse true
 */
export const syncProductCacheVersion = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && now - lastCheckAt < VERSION_CHECK_MS) return false;
  lastCheckAt = now;
  try {
    const value = await withTimeout(redis.get(VERSION_KEY));
    if (value === undefined) return false; // zaman aşımı
    const version = value === null ? "0" : String(value);
    if (seenVersion === null) {
      seenVersion = version;
      lastInvalidatedAt = Math.max(lastInvalidatedAt, stampOf(version));
      return false;
    }
    if (version === seenVersion) return false;
    seenVersion = version;
    lastInvalidatedAt = Math.max(lastInvalidatedAt, stampOf(version));
    clearLocal();
    return true;
  } catch {
    return false;
  }
};

/**
 * Son bilinen geçersiz kılma zamanı (ms). Last-Modified hesaplanırken ürün updatedAt'i ile
 * birlikte kullanılır: haftalık fiyat değişimi ya da indirimi biten ürün listeden düşünce
 * (en yeni updatedAt değişmeyebilir) istemciye yanlışlıkla 304 dönülmez.
 */
export const getProductCacheStamp = () => lastInvalidatedAt;

/** Yalnızca testler için */
export const resetProductCacheState = () => {
  seenVersion = null;
  lastCheckAt = 0;
  lastInvalidatedAt = 0;
};
