// ── Geciken sipariş akışı ─────────────────────────────────────────────────────
// Müşteri sipariş durumunu sorduğunda sipariş 45 dakikadan uzun süredir "Hazırlanıyor"
// durumundaysa asistan bekleme süresini hesaplar, özür diler ve market yetkilisine iletir.
// Müşteri ardından tekrar yazarsa bir kez canlı destek teklif edilir; "evet" derse aktarılır.
// Bu dosyadaki fonksiyonlar saf (veritabanına dokunmaz); akış assistant.service.js içindedir.

export const ORDER_DELAY_MINUTES = 45;
export const ORDER_TOOL_NAMES = new Set(["getMyActiveOrders", "getOrderStatus", "getOrderDetails"]);

const normalize = (value) => String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
const plain = (value) => normalize(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export const shortOrderCode = (id) => String(id || "").slice(-8).toUpperCase();

// Siparişin "Hazırlanıyor" durumuna en son geçtiği an; geçmiş yoksa oluşturulma zamanı.
export const preparingSince = (order) => {
  const entry = [...(order?.statusHistory || [])].reverse().find((item) => item?.status === "Hazırlanıyor" && item.changedAt);
  const value = new Date(entry?.changedAt || order?.createdAt);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const preparingMinutes = (order, now = new Date()) => {
  if (order?.status !== "Hazırlanıyor") return 0;
  const since = preparingSince(order);
  return since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000)) : 0;
};

export const isDelayed = (order, now = new Date()) => preparingMinutes(order, now) >= ORDER_DELAY_MINUTES;

// 50 → "50 dakikadır", 80 → "1 saat 20 dakikadır", 120 → "2 saattir", 1600 → "1 günü aşkın süredir"
export const formatWaitDuration = (minutes) => {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} günü aşkın süredir`;
  if (minutes < 60) return `${minutes} dakikadır`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} saat ${rest} dakikadır` : `${hours} saattir`;
};

// Mesajdaki "#6ac8bc4d" gibi kısa sipariş kodu (sipariş kimliğinin son 8 hanesi).
export const extractShortOrderCode = (query) => String(query || "").match(/#\s?([a-f\d]{8})\b/i)?.[1]?.toUpperCase() || null;

// Aday siparişler arasından müşterinin kastettiğini seçer: önce tam kimlik, sonra kısa kod,
// yoksa en uzun süredir bekleyen geciken sipariş.
export const pickDelayedOrder = (orders, { orderId = null, shortCode = null, now = new Date() } = {}) => {
  const list = (orders || []).filter(Boolean);
  const named = orderId ? list.find((order) => String(order._id) === String(orderId))
    : shortCode ? list.find((order) => shortOrderCode(order._id) === shortCode) : null;
  if (orderId || shortCode) return named && isDelayed(named, now) ? named : null;
  return list.filter((order) => isDelayed(order, now)).sort((a, b) => preparingMinutes(b, now) - preparingMinutes(a, now))[0] || null;
};

export const delayNoticeMessage = (order, now = new Date()) =>
  `Siparişinizin (#${shortOrderCode(order._id)}) ${formatWaitDuration(preparingMinutes(order, now))} hazırlandığını görüyorum. `
  + "Durumu market yetkilimize ilettim; siparişiniz en kısa sürede yola çıkacaktır. "
  + "Yoğunluktan kaynaklanan bu gecikme için özür dileriz, anlayışınız için teşekkür ederiz. 🙏";

export const liveSupportOfferMessage = () =>
  "Anlayışınız için teşekkür ederiz. Siparişinizle ilgili bir yetkilimizle görüşmek isterseniz sizi canlı desteğe bağlayabilirim; "
  + "“Evet” yazmanız ya da Canlı Destek seçeneğine dokunmanız yeterli.";

export const liveSupportDeclinedMessage = () =>
  "Peki, siparişiniz yola çıktığında durumu uygulamadan takip edebilirsiniz. Başka bir konuda yardımcı olabilirsem buradayım.";

export const delayAdminNotice = (order, now = new Date()) =>
  `⏰ Geciken sipariş #${shortOrderCode(order._id)}: ${formatWaitDuration(preparingMinutes(order, now))} hazırlanıyor. Müşteri sohbetten durumu sordu ve bilgilendirildi.`;

const AFFIRMATIVE = /^(evet|evt|olur|isterim|lutfen|bagla|baglayin|baglayabilirsin|baglayabilirsiniz|bagla lutfen|baglar misin|baglar misiniz)( (evet|olur|isterim|lutfen|bagla|baglayin|baglar misin|baglar misiniz|tabi|tabii|tesekkurler|tesekkur ederim))*$/;
const NEGATIVE = /^(hayir|yok|gerek yok|istemiyorum|kalsin|beklerim|bekleyecegim|hayir tesekkurler|yok tesekkurler|gerek yok tesekkurler|hayir gerek yok)$/;
export const isAffirmative = (query) => AFFIRMATIVE.test(plain(query).replace(/^(evet )?(tabi|tabii|tabiki|tabii ki|elbette)$/, "evet"));
export const isNegative = (query) => NEGATIVE.test(plain(query));
