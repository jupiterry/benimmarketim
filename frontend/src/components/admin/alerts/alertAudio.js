// Uyarı sesleri. Tek ve kalıcı bir <audio> oynatıcısı kullanılır: iOS Safari ses kilidini öğe başına açar, her
// uyarıda yeni Audio() oluşturmak kilidi kaybettirir. Tarayıcı otomatik sesi engellerse (play() → NotAllowedError)
// "blocked" durumu yayınlanır; panel "Ses kapalı · açmak için tıklayın" uyarısını gösterir. Sayfada herhangi bir
// tıklama/tuş da (kullanıcı etkileşimi) sesi sessizce açar. Müşteri iptali için yeni sipariş sesinden belirgin farklı,
// Web Audio ile üretilen kısa bir uyarı çalınır.
import { useSyncExternalStore } from "react";
import { ALERT_SOUND_MAX_MS, normalizeSound, soundUrl } from "./alertRules";

const hasWindow = typeof window !== "undefined";
const clampVolume = (value) => Math.min(1, Math.max(0, Number(value) || 0));

// ── Durum (React useSyncExternalStore) ────────────────────────────────────
let snapshot = { blocked: false, previewing: false };
const listeners = new Set();
const setState = (patch) => {
  const next = { ...snapshot, ...patch };
  if (next.blocked === snapshot.blocked && next.previewing === snapshot.previewing) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
};
export const audioState = {
  get: () => snapshot,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
export const useAudioState = () => useSyncExternalStore(audioState.subscribe, audioState.get, audioState.get);

// ── Oynatıcı ──────────────────────────────────────────────────────────────
let player = null;
let playerSrc = "";
let stopTimer = null;
let playToken = 0;

const getPlayer = () => {
  if (player || !hasWindow || typeof window.Audio !== "function") return player;
  player = new window.Audio();
  player.preload = "auto";
  player.addEventListener("ended", () => setState({ previewing: false }));
  return player;
};

/** play() sonucu: "played" | "blocked" (otomatik ses engeli) | "aborted" (yerine başka ses başladı) | "error" */
const settle = (promise) =>
  promise.then(
    () => {
      setState({ blocked: false });
      return "played";
    },
    (error) => {
      if (error?.name === "NotAllowedError") {
        setState({ blocked: true });
        return "blocked";
      }
      return error?.name === "AbortError" ? "aborted" : "error";
    },
  );

const start = (src, { volume, maxMs = 0, preview = false }) => {
  const audio = getPlayer();
  if (!audio) return Promise.resolve("error");
  playToken += 1;
  const token = playToken;
  clearTimeout(stopTimer);
  if (playerSrc !== src) {
    audio.src = src;
    playerSrc = src;
  }
  try {
    audio.currentTime = 0;
  } catch {
    // dosya henüz yüklenmedi: baştan başlar
  }
  audio.volume = clampVolume(volume);
  audio.muted = false;
  let promise;
  try {
    promise = audio.play();
  } catch (error) {
    promise = Promise.reject(error);
  }
  // Çok eski tarayıcılar play()'den söz (promise) döndürmez
  if (!promise || typeof promise.then !== "function") promise = Promise.resolve();
  setState({ previewing: preview });
  if (maxMs > 0) {
    stopTimer = setTimeout(() => {
      if (token !== playToken) return;
      audio.pause();
      setState({ previewing: false });
    }, maxMs);
  }
  return settle(promise).then((result) => {
    if (result !== "played" && token === playToken) setState({ previewing: false });
    return result;
  });
};

// 0,2 sn sessiz WAV: tarayıcının sesi engelleyip engellemediğini duyulur bir ses çalmadan anlamak için
let silentSrc = "";
const silentWav = () => {
  if (silentSrc) return silentSrc;
  const samples = 1600; // 8 kHz, 8 bit, tek kanal
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8 bit PCM'de 128 = sessizlik
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  silentSrc = `data:audio/wav;base64,${window.btoa(binary)}`;
  return silentSrc;
};

// ── Web Audio (iptal uyarısı ve ses dosyası yüklenemezse yedek bip) ───────
let context = null;
const getContext = () => {
  if (context || !hasWindow) return context;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
};
const resumeContext = () => {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
};
/** Bağlam çalışmıyorsa en çok 200 ms açmayı dener; çalışıyorsa true */
const readyContext = async () => {
  const ctx = getContext();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    try {
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 200))]);
    } catch {
      // açılamadı
    }
  }
  return ctx.state === "running" ? ctx : null;
};
const scheduleTones = (ctx, volume, pattern) => {
  const peak = Math.max(0.0002, clampVolume(volume) * 0.22);
  const t0 = ctx.currentTime + 0.03;
  for (const [offset, frequency] of pattern) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, t0 + offset);
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + offset + 0.012);
    gain.gain.setValueAtTime(peak, t0 + offset + 0.11);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.15);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(t0 + offset);
    oscillator.stop(t0 + offset + 0.16);
  }
};
// İptal: iki kez "yüksek → alçak" (yeni sipariş müziğinden ayırt edilir). Yedek bip: yükselen üç ton, iki kez.
const CANCEL_PATTERN = [[0, 988], [0.17, 659], [0.5, 988], [0.67, 659]];
const BEEP_PATTERN = [[0, 523], [0.16, 659], [0.32, 784], [0.7, 523], [0.86, 659], [1.02, 784]];

// ── Dışa açık işlemler ────────────────────────────────────────────────────
/** Yeni sipariş sesi (en çok ALERT_SOUND_MAX_MS). Dosya çalınamazsa ("error") Web Audio ile bip denenir. */
export const playAlertSound = async ({ sound, volume }) => {
  const result = await start(soundUrl(sound), { volume, maxMs: ALERT_SOUND_MAX_MS });
  if (result !== "error") return result;
  const ctx = await readyContext();
  if (!ctx) return result;
  try {
    scheduleTones(ctx, volume, BEEP_PATTERN);
    return "played";
  } catch {
    return result;
  }
};

/**
 * Müşteri iptali uyarısı. Web Audio kullanılamazsa seçili sesten farklı kısa bir dosya çalınır. Web Audio'nun
 * çalması <audio> oynatıcısının kilidinin açık olduğu anlamına gelmez (iOS kilidi öğe başına tutar); "Ses kapalı"
 * uyarısına yalnızca oynatıcının sonucu karar verir.
 */
export const playCancelWarning = async ({ sound, volume }) => {
  const ctx = await readyContext();
  if (ctx) {
    try {
      scheduleTones(ctx, volume, CANCEL_PATTERN);
      return "played";
    } catch {
      // dosyaya düş
    }
  }
  const fallback = normalizeSound(sound) === "chime" ? "bell" : "chime";
  return start(soundUrl(fallback), { volume, maxMs: 2500 });
};

/** Ayarlardaki "Dene": seçili sesi çalar (kullanıcı etkileşimi olduğu için kilidi de açar) */
export const previewSound = ({ sound, volume }) => {
  resumeContext();
  return start(soundUrl(sound), { volume, maxMs: ALERT_SOUND_MAX_MS, preview: true });
};
export const stopPreview = () => {
  if (!snapshot.previewing) return;
  playToken += 1;
  clearTimeout(stopTimer);
  player?.pause();
  setState({ previewing: false });
};

/** "Ses kapalı · açmak için tıklayın": tıklama anında çağrılır, seçili sesten kısa bir parça çalar */
export const unlockWithSound = ({ sound, volume }) => {
  resumeContext();
  return start(soundUrl(sound), { volume, maxMs: 2500 });
};

/**
 * Açılışta sessiz deneme: tarayıcı sesi engelliyorsa uyarı ilk siparişi beklemeden görünür.
 * Firefox'un getAutoplayPolicy'si varsa ona bakılır; yoksa sessiz WAV çalınmaya çalışılır.
 */
export const probeAutoplay = () => {
  if (!hasWindow) return Promise.resolve("error");
  let policy = "";
  try {
    policy = navigator.getAutoplayPolicy?.("mediaelement") || "";
  } catch {
    policy = "";
  }
  if (policy === "allowed") {
    setState({ blocked: false });
    return Promise.resolve("played");
  }
  if (policy === "disallowed" || policy === "allowed-muted") {
    setState({ blocked: true });
    return Promise.resolve("blocked");
  }
  return start(silentWav(), { volume: 1 });
};

/**
 * Ses engelliyken sayfadaki ilk tıklama/tuşta sessiz bir çalma denenir: tarayıcı artık izin veriyorsa uyarı
 * kendiliğinden kalkar. [data-audio-unlock] öğeleri (uyarının kendisi) sesli açtığı için atlanır. Kaldırma fonksiyonu döner.
 * Yalnızca "click" ve "keydown" dinlenir: basma (pointerdown/touchend) anında açılsaydı uyarı şeridi tıklama bitmeden
 * kalkar, altındaki içerik yukarı kayar ve tıklama başka bir öğeye düşebilirdi. Tıklama hareketin son olayıdır.
 */
export const installGestureUnlock = () => {
  if (!hasWindow) return () => {};
  let unlocking = false;
  const onGesture = (event) => {
    if (!snapshot.blocked || unlocking) return;
    if (event?.target?.closest?.("[data-audio-unlock]")) return;
    unlocking = true;
    resumeContext();
    start(silentWav(), { volume: 1 }).finally(() => {
      unlocking = false;
    });
  };
  const types = ["click", "keydown"];
  types.forEach((type) => window.addEventListener(type, onGesture, true));
  return () => types.forEach((type) => window.removeEventListener(type, onGesture, true));
};
