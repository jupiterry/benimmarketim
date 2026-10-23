/**
 * deliveryArea.service.js — Devrek teslimat alanının (sınır çokgeni) OpenStreetMap Nominatim'den yüklenmesi.
 *
 * - fetchDevrekAreaCandidates: "Devrek, Zonguldak, Türkiye" araması (gerekirse ikinci, yapılandırılmış sorgu).
 *   Yalnızca Polygon/MultiPolygon olan ve mağaza noktasını (STORE_POINT) içeren sonuçlar aday olur; adaylar
 *   alana göre küçükten büyüğe sıralanır (en küçüğü = Devrek merkez/belediye sınırı, büyüğü = ilçe).
 *   Çokgenler 30 dk bellekte tutulur (seçim için); belgeye yalnızca çokgensiz aday listesi yazılır.
 * - getCandidatePolygon: önbellekten, yoksa Nominatim lookup ile seçilen adayın çokgenini getirir.
 * Nominatim kullanım kuralları: tanımlı User-Agent, en fazla saniyede 1 istek (iki sorgu arasında bekleme),
 * 10 sn zaman aşımı. Node'un global fetch'i kullanılır (testlerde taklit edilir).
 */

import { STORE_POINT, areaKm2Of, isAreaGeometry, pointInArea } from "./delivery.service.js";

export const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
export const NOMINATIM_USER_AGENT = "BenimMarketim/1.0 (+https://devrekbenimmarketim.com)";
export const DEVREK_QUERY = "Devrek, Zonguldak, Türkiye";
// Testler bekleme süresini sıfırlayabilsin diye değiştirilebilir yapılandırma
export const nominatimConfig = { timeoutMs: 10000, delayMs: 1100, cacheTtlMs: 30 * 60 * 1000 };

const OSM_PREFIX = { relation: "R", way: "W", node: "N" };
const OSM_FROM_LETTER = { R: "relation", W: "way", N: "node" };
const polygonCache = new Map(); // "relation:123" → { geometry, candidate, at }
const MAX_CACHE = 50;

export const candidateKey = (osmType, osmId) => `${osmType}:${Number(osmId)}`;
export const clearAreaCache = () => polygonCache.clear();

const areaError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

export const searchUrl = () =>
  `${NOMINATIM_BASE}/search?q=${encodeURIComponent(DEVREK_QUERY)}&format=jsonv2&polygon_geojson=1&limit=10&extratags=1`;
export const structuredSearchUrl = () =>
  `${NOMINATIM_BASE}/search?city=Devrek&state=Zonguldak&country=${encodeURIComponent("Türkiye")}&format=jsonv2&polygon_geojson=1&limit=10&extratags=1`;
export const lookupUrl = (osmType, osmId) =>
  `${NOMINATIM_BASE}/lookup?osm_ids=${OSM_PREFIX[osmType]}${Number(osmId)}&format=jsonv2&polygon_geojson=1&extratags=1`;

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

const requestJson = async (url) => {
  if (typeof globalThis.fetch !== "function") throw areaError("Sunucuda fetch desteği yok", 500, "AREA_FETCH_FAILED");
  let response;
  try {
    response = await globalThis.fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json", "Accept-Language": "tr" },
      signal: AbortSignal.timeout(nominatimConfig.timeoutMs),
    });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw areaError(
      timeout ? "OpenStreetMap 10 saniye içinde yanıt vermedi. Biraz sonra tekrar deneyin." : "OpenStreetMap'e ulaşılamadı. Biraz sonra tekrar deneyin.",
      502,
      "AREA_FETCH_FAILED"
    );
  }
  if (!response?.ok) {
    const status = Number(response?.status) || 0;
    throw areaError(
      status === 429 ? "OpenStreetMap çok sık istek nedeniyle yanıt vermedi. Birkaç dakika sonra tekrar deneyin." : `OpenStreetMap yanıt vermedi (HTTP ${status}).`,
      502,
      "AREA_FETCH_FAILED"
    );
  }
  try {
    return await response.json();
  } catch {
    throw areaError("OpenStreetMap yanıtı okunamadı", 502, "AREA_FETCH_FAILED");
  }
};

const normalizeOsmType = (value) => {
  const text = String(value || "").trim();
  if (OSM_PREFIX[text.toLowerCase()]) return text.toLowerCase();
  return OSM_FROM_LETTER[text.toUpperCase()] || null;
};

/** Yönetim seviyesi: extratags.admin_level, yoksa idari sınırda place_rank / 2. */
const adminLevelOf = (item) => {
  const tagged = Number(item?.extratags?.admin_level ?? item?.extratags?.["admin_level"]);
  if (Number.isInteger(tagged) && tagged > 0 && tagged <= 12) return tagged;
  const category = item?.category ?? item?.class;
  const rank = Number(item?.place_rank);
  if (category === "boundary" && item?.type === "administrative" && Number.isFinite(rank) && rank > 0) return Math.round(rank / 2);
  return null;
};

/** Nominatim sonucu → { candidate, geometry } ya da null (çokgen değil / geçersiz / mağazayı içermiyor). */
export const toCandidate = (item) => {
  const osmType = normalizeOsmType(item?.osm_type);
  const osmId = Number(item?.osm_id);
  const geometry = item?.geojson;
  if (!osmType || osmType === "node" || !Number.isSafeInteger(osmId) || osmId <= 0) return null;
  if (!isAreaGeometry(geometry) || !pointInArea(STORE_POINT, geometry)) return null;
  return {
    candidate: {
      osmType,
      osmId,
      adminLevel: adminLevelOf(item),
      kind: [item?.category ?? item?.class, item?.type].filter(Boolean).join(":").slice(0, 60),
      displayName: String(item?.display_name || "").slice(0, 300),
      areaKm2: areaKm2Of(geometry),
    },
    geometry: { type: geometry.type, coordinates: geometry.coordinates },
  };
};

const remember = (entry) => {
  polygonCache.set(candidateKey(entry.candidate.osmType, entry.candidate.osmId), { ...entry, at: Date.now() });
  while (polygonCache.size > MAX_CACHE) polygonCache.delete(polygonCache.keys().next().value);
};

const collect = (items, into) => {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const entry = toCandidate(item);
    if (!entry) continue;
    const key = candidateKey(entry.candidate.osmType, entry.candidate.osmId);
    if (!into.has(key)) into.set(key, entry);
  }
};

const runFetch = async () => {
  const found = new Map();
  collect(await requestJson(searchUrl()), found);
  // İlk sorgu yalnızca tek (genelde ilçe) sınır verdiyse yapılandırılmış sorgu merkez sınırını da bulabilir
  if (found.size < 2) {
    await wait(nominatimConfig.delayMs);
    collect(await requestJson(structuredSearchUrl()), found);
  }
  if (!found.size) {
    throw areaError("OpenStreetMap'te mağaza noktasını içeren bir Devrek sınırı bulunamadı.", 404, "AREA_NOT_FOUND");
  }
  const entries = [...found.values()].sort((a, b) => (a.candidate.areaKm2 ?? Infinity) - (b.candidate.areaKm2 ?? Infinity));
  entries.forEach(remember);
  return {
    candidates: entries.map((entry) => entry.candidate),
    polygons: new Map(entries.map((entry) => [candidateKey(entry.candidate.osmType, entry.candidate.osmId), entry.geometry])),
  };
};

let inflight = null;
/**
 * Devrek sınır adaylarını getirir. Hiç uygun aday yoksa 404 AREA_NOT_FOUND. Aynı anda gelen istekler tek
 * Nominatim sorgusunu paylaşır (çift tıklama kullanım sınırını aşmasın).
 * @returns {Promise<{ candidates: object[], polygons: Map<string, object> }>} adaylar alana göre artan sırada
 */
export const fetchDevrekAreaCandidates = () => {
  if (!inflight) inflight = runFetch().finally(() => { inflight = null; });
  return inflight;
};

/**
 * Adayın çokgeni: 30 dk önbellek, yoksa Nominatim lookup. Mağaza noktasını içermiyorsa 422 AREA_INVALID.
 * @returns {Promise<{ candidate, geometry }>}
 */
export const getCandidatePolygon = async (osmType, osmId) => {
  const key = candidateKey(osmType, osmId);
  const cached = polygonCache.get(key);
  if (cached && Date.now() - cached.at < nominatimConfig.cacheTtlMs) return { candidate: cached.candidate, geometry: cached.geometry };
  const items = await requestJson(lookupUrl(osmType, osmId));
  const item = Array.isArray(items) ? items.find((row) => normalizeOsmType(row?.osm_type) === osmType && Number(row?.osm_id) === Number(osmId)) : null;
  if (!item) throw areaError("Seçilen sınır OpenStreetMap'te bulunamadı. Sınırı yeniden yükleyin.", 404, "AREA_NOT_FOUND");
  const entry = toCandidate(item);
  if (!entry) throw areaError("Seçilen sınır mağaza noktasını içermiyor ya da çokgen değil.", 422, "AREA_INVALID");
  remember(entry);
  return entry;
};
