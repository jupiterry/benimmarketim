// OpenRouter model keşfi: https://openrouter.ai/api/v1/models listesini çeker ve önbelleğe alır.
// Ücretsiz (":free") modeller zamanla kaldırılıp yeniden adlandırıldığı için sabit bir model adına
// güvenmek yerine sağlayıcıdaki canlı listeye bakılır. Hiçbir fonksiyon hata fırlatmaz:
// liste alınamazsa null ("bilinmiyor") döner ve çağıran eski davranışla devam eder.
import { redis } from "../../lib/redis.js";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Liste alınamadığında her istekte tekrar denenmesin diye kısa bir bekleme
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const REDIS_KEY = "ai:openrouter:models:v1";
const REDIS_TIMEOUT_MS = 1500;
const MIN_CONTEXT = 8000;

// Tercih sırası: Türkçe metin ve araç çağrısında iyi bilinen aileler önce gelir.
const PREFERRED_FAMILIES = [
  /^google\/gemma/,
  /^google\/gemini/,
  /^meta-llama\/llama-(3\.3|4)/,
  /^qwen\/qwen3/,
  /^mistralai\//,
  /^deepseek\//,
  /^openai\/gpt-oss/,
  /^nvidia\/nemotron/,
  /^z-ai\/glm/,
  /^moonshotai\/kimi/,
];
// Kişisel verileri istemleri kaydeden/yayınlayan deneysel uç noktalara göndermemek için hariç tutulanlar:
// OpenRouter'ın kendi "stealth"/yönlendirici modelleri ve Inkling.
const EXCLUDED = [/^openrouter\//, /inkling/i];

let memory = null; // { fetchedAt: ms, models: [...] }
let failedAt = 0;
let inflight = null;

const isFresh = (entry, now = Date.now()) => Boolean(entry?.models?.length) && now - entry.fetchedAt < CACHE_TTL_MS;

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms).unref?.()),
]);

/** OpenRouter'ın ham model kaydını panelin ve sağlayıcının kullandığı sade biçime çevirir. */
export const normalizeOpenRouterModel = (raw) => {
  const id = typeof raw?.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const params = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : [];
  const outputs = Array.isArray(raw.architecture?.output_modalities) ? raw.architecture.output_modalities : null;
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
    free: id.endsWith(":free"),
    tools: params.includes("tools"),
    context: Number(raw.context_length || raw.top_provider?.context_length) || 0,
    text: outputs ? outputs.includes("text") : true,
  };
};

/** /models yanıtını ayrıştırır; beklenen biçimde değilse null döner. */
export const parseOpenRouterModels = (body) => {
  if (!Array.isArray(body?.data)) return null;
  const seen = new Set();
  const models = [];
  for (const raw of body.data) {
    const model = normalizeOpenRouterModel(raw);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return models.length ? models : null;
};

const familyRank = (id) => {
  const index = PREFERRED_FAMILIES.findIndex((pattern) => pattern.test(id));
  return index === -1 ? PREFERRED_FAMILIES.length : index;
};

/** Ücretsiz modelleri tercih sırasına dizer: bilinen aileler önce, sonra geniş bağlam penceresi. */
export const rankFreeModels = (models, { needsTools = false } = {}) => (models || [])
  .filter((model) => model.free && model.text !== false && model.context >= MIN_CONTEXT)
  .filter((model) => !EXCLUDED.some((pattern) => pattern.test(model.id)))
  .filter((model) => !needsTools || model.tools)
  .sort((a, b) => familyRank(a.id) - familyRank(b.id) || b.context - a.context || a.id.localeCompare(b.id));

const readRedis = async () => {
  try {
    const raw = await withTimeout(redis.get(REDIS_KEY), REDIS_TIMEOUT_MS);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return isFresh(entry) ? entry : null;
  } catch {
    return null;
  }
};

const writeRedis = async (entry) => {
  try {
    await withTimeout(redis.set(REDIS_KEY, JSON.stringify(entry), "EX", Math.ceil(CACHE_TTL_MS / 1000)), REDIS_TIMEOUT_MS);
  } catch {
    // Redis yoksa yalnızca bellek önbelleği kullanılır
  }
};

const fetchRemote = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (process.env.OPENROUTER_API_KEY) headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    const response = await fetch(OPENROUTER_MODELS_URL, { method: "GET", headers, signal: controller.signal });
    if (!response?.ok) throw new Error(`OPENROUTER_MODELS_${response?.status}`);
    const models = parseOpenRouterModels(await response.json());
    if (!models) throw new Error("OPENROUTER_MODELS_INVALID");
    return { fetchedAt: Date.now(), models };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Model listesini döner: { fetchedAt, models } ya da null.
 * cachedOnly: yalnızca bellek/Redis önbelleğine bakar, ağa çıkmaz (istek yolunu yavaşlatmamak için).
 * refresh: önbelleği yok sayıp yeniden çeker.
 */
export const getOpenRouterModels = async ({ cachedOnly = false, refresh = false, maxAgeMs = 0 } = {}) => {
  try {
    const youngEnough = (entry) => isFresh(entry) && (!maxAgeMs || Date.now() - entry.fetchedAt < maxAgeMs);
    if (!refresh) {
      if (youngEnough(memory)) return memory;
      if (!isFresh(memory)) {
        const stored = await readRedis();
        if (stored) memory = stored;
      }
      if (youngEnough(memory)) return memory;
    }
    // Yeniden çekilemezse süresi dolmamış (ama maxAgeMs'den eski) liste yine kullanılabilir
    const fallback = isFresh(memory) ? memory : null;
    if (cachedOnly) return fallback;
    if (!refresh && Date.now() - failedAt < FAILURE_BACKOFF_MS) return fallback;
    if (!inflight) {
      inflight = fetchRemote()
        .then(async (entry) => {
          memory = entry;
          failedAt = 0;
          await writeRedis(entry);
          return entry;
        })
        .catch((error) => {
          failedAt = Date.now();
          console.warn("OpenRouter model listesi alınamadı:", error?.name === "AbortError" ? "zaman aşımı" : String(error?.message || error).slice(0, 120));
          return null;
        })
        .finally(() => { inflight = null; });
    }
    return (await inflight) || fallback;
  } catch {
    return null;
  }
};

/** Mevcut model kimlikleri (Set) ya da bilinmiyorsa null. */
export const availableIds = async (options) => {
  const entry = await getOpenRouterModels(options);
  return entry ? new Set(entry.models.map((model) => model.id)) : null;
};

/** Tercih sırasına dizilmiş ücretsiz model kimlikleri ya da bilinmiyorsa null. */
export const freeModels = async ({ needsTools = false, ...options } = {}) => {
  const entry = await getOpenRouterModels(options);
  return entry ? rankFreeModels(entry.models, { needsTools }).map((model) => model.id) : null;
};

/** Model OpenRouter'da var mı: true / false, liste alınamadıysa null. */
export const isAvailable = async (id, options) => {
  const ids = await availableIds(options);
  return ids ? ids.has(id) : null;
};

/** Model kaydı (araç desteği vb. için) ya da bilinmiyorsa null. */
export const findModel = async (id, options) => {
  const entry = await getOpenRouterModels(options);
  return entry ? entry.models.find((model) => model.id === id) || false : null;
};

/** Panel için: ücretsizler önce (tercih sırasıyla), sonra diğerleri ada göre. */
export const listModelsForAdmin = async ({ refresh = false } = {}) => {
  const entry = await getOpenRouterModels({ refresh });
  if (!entry) return null;
  const ranked = rankFreeModels(entry.models);
  const rankedIds = new Set(ranked.map((model) => model.id));
  const rest = entry.models
    .filter((model) => !rankedIds.has(model.id) && model.text !== false)
    .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name, "tr"));
  return {
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
    models: [...ranked, ...rest].map(({ id, name, free, tools, context }) => ({ id, name, free, tools, context })),
  };
};

/** Sunucu açılışında listeyi arka planda ısıtır; sonuç beklenmez, hata fırlatmaz. */
export const warmOpenRouterModels = () => {
  getOpenRouterModels().catch(() => {});
};

/** Listeyi açılışta ve önbellek süresi dolmadan önce periyodik olarak yeniler (yalnızca OpenRouter anahtarı varsa). */
export const startOpenRouterModelRefresh = () => {
  if (!process.env.OPENROUTER_API_KEY) return null;
  warmOpenRouterModels();
  const timer = setInterval(() => { getOpenRouterModels({ refresh: true }).catch(() => {}); }, CACHE_TTL_MS - 10 * 60 * 1000);
  timer.unref?.();
  return timer;
};

/** Testler için önbelleği sıfırlar. */
export const resetOpenRouterModelCache = async () => {
  memory = null;
  failedAt = 0;
  inflight = null;
  try { await redis.del(REDIS_KEY); } catch { /* yok say */ }
};
