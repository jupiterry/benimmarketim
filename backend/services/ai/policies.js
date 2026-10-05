const HUMAN_PATTERN = /(yetkili|insan|canlı destek|müşteri hizmet|temsilci|görevli).*(bağlan|konuş|istiyorum)|^(yetkili|insan|canlı destek)$/i;
const REVIEW_PATTERN = /(itiraz|şik[aâ]yet|ödeme (sorun|hata)|para (iade|çekildi)|kartımdan|dolandır)/i;
const INJECTION_PATTERN = /(önceki|tüm) talimatları unut|system prompt|sistem (mesajı|talimatı)|api key|environment variable|gizli bilg/i;

export const classifyMessage = (query) => {
  const text = String(query || "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (INJECTION_PATTERN.test(text)) return "injection";
  const plain = text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  const declined = /istemiyorum|baglanma istem|gerek yok/.test(plain);
  if (!declined && (HUMAN_PATTERN.test(text) || /^(canli destek|yetkili|musteri temsilcisi)$/.test(plain) || /(canli destek|temsilci|personel|insan|yetkili).*(istiyorum|baglan|konus|gorus)/.test(plain))) return "human_request";
  if (REVIEW_PATTERN.test(text)) return "human_review";
  return "answer";
};

export const isServiceQuestion = (query) => /\b(fotokopi|fotokpi|cikti|yazdirma|yazdirabilir|belge|dokuman|baski)\b/.test(String(query || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i"));

export const ownedOrderFilter = (orderId, userId) => orderId ? { _id: orderId, user: userId } : { user: userId };
export const supportAcceptanceFilter = (id) => ({ _id: id, status: "waiting", assignedTo: null });
export const shouldHandoffWithoutContext = (knowledge, toolContext) => !knowledge.length && !toolContext.length;
export const providerFailureMessage = () => "Şu anda yapay zekâ asistanımıza erişilemiyor. Sizi destek ekibimize aktarıyorum.";
export const buildSupportEventPayload = ({ request, chat, customerName, reason, summary, priority }) => ({
  supportRequestId: String(request._id), conversationId: String(chat._id), userId: String(chat.user),
  customerName: customerName || "Müşteri", reason, aiSummary: summary, priority, createdAt: request.createdAt,
});

const normalizeSearch = (value) => String(value || "")
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i");

const searchWords = (value) => normalizeSearch(value).match(/[a-z0-9çğıöşü]{3,}/g) || [];
const ignoredSearchWords = new Set(["ben", "bir", "bu", "da", "de", "mi", "mı", "mu", "mü", "var", "ve", "ile", "icin", "için", "merhaba", "lutfen", "lütfen", "nedir", "nasil", "nasıl", "istiyorum", "ediyorum", "eder", "misiniz", "mısınız", "musunuz", "musun"]);

// "iadeler" ↔ "iade", "teslimatı" ↔ "teslimat" gibi ek almış biçimleri yakalar.
const sharesStem = (word, candidate) => {
  const [short, long] = word.length <= candidate.length ? [word, candidate] : [candidate, word];
  return short.length >= 4 && long.length - short.length <= 5 && long.startsWith(short);
};

const distanceAtMostOne = (left, right) => {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits <= 1;
};

export const rankKnowledgeRows = (query, rows) => {
  const words = [...new Set(searchWords(query).filter((word) => !ignoredSearchWords.has(word)))];
  return rows.map((row) => {
    const titleWords = searchWords(row.title);
    const categoryWords = searchWords(row.category);
    const keywordWords = (row.keywords || []).flatMap(searchWords);
    const contentWords = searchWords(row.content);
    let score = 0;
    for (const word of words) {
      if (titleWords.includes(word)) score += 5;
      else if (titleWords.some((candidate) => (word.length >= 5 && distanceAtMostOne(word, candidate)) || sharesStem(word, candidate))) score += 3.5;
      if (keywordWords.includes(word)) score += 4;
      else if (keywordWords.some((candidate) => (word.length >= 5 && distanceAtMostOne(word, candidate)) || sharesStem(word, candidate))) score += 3;
      if (categoryWords.includes(word)) score += 1.5;
      if (contentWords.includes(word)) score += 0.5;
    }
    return { ...row, score };
  }).filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score || b.priority - a.priority || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);
};

export const unknownAnswerOffer = () => "Bu konuda şu anda doğrulanmış bilgi bulamadım. İsterseniz aşağıdaki Canlı Destek seçeneğine dokunarak ekibimize bağlanabilirsiniz.";

// ── Selamlaşma, teşekkür, veda ve "ne yapabilirsin" gibi kısa sohbet mesajları ──
// Bu mesajlarda doğrulanacak veri yoktur; model çağrılmadan sabit ve sıcak bir yanıt verilir.
// Mesajda başka bir soru varsa (ör. "Merhaba, süt var mı?") null döner ve normal akış çalışır.
const SMALL_TALK = [
  { pattern: /^(tesekkur(ler| ederim| ediyorum)?|cok tesekkur(ler| ederim)?|sag ?ol(un)?|cok sag ?ol(un)?|eyvallah|tsk|tskler|tesekkurler cok|eline saglik|elinize saglik)( kolay gelsin| iyi (gunler|aksamlar|geceler|calismalar))?$/, reply: "Rica ederim! Başka bir konuda yardımcı olabilirsem buradayım." },
  { pattern: /^(tamam|tamamdir|peki|anladim|oldu|ok|okey|super|harika|guzel|tamam tesekkur(ler| ederim)?|tamam sag ?ol(un)?)$/, reply: "Harika! Başka bir sorunuz olursa yazmanız yeterli." },
  { pattern: /^(gorusuruz|hosca ?kal(in)?|bay ?bay|allaha ismarladik)$/, reply: "İyi günler dilerim! Yine beklerim." },
  { pattern: /^(iyi (gunler|aksamlar|geceler|sabahlar|calismalar)|gunaydin|hayirli (gunler|aksamlar|sabahlar|isler)|kolay gelsin)$/, reply: "Size de! Yardımcı olabileceğim bir konu olursa yazmanız yeterli." },
  { pattern: /^(sen )?(kimsin|nesin|bot musun|robot musun|insan misin|yapay zeka misin|gercek misin)$/, reply: "Ben Benim Marketim'in yapay zekâ asistanıyım. Ürün, fiyat ve stok bilgisi, siparişiniz, kampanyalar, kuponlar ve hizmetlerimiz hakkında yardımcı olabilirim. Dilerseniz sizi canlı destek ekibimize de bağlayabilirim." },
  { pattern: /^(ne(ler)? yapabilirsin|ne(ler)? yapabiliyorsun|nasil yardimci olabilirsin|ne sorabilirim|neler sorabilirim|yardim|yardim et|yardim eder misin|yardimci olur musun|bana yardim et)$/, reply: "Şunlarda yardımcı olabilirim:\n• Ürün arama, güncel fiyat ve stok durumu\n• Siparişinizin durumu\n• Aktif kampanyalar ve kuponlarınız\n• Sipariş saatleri ve minimum sepet tutarı\n• Fotokopi hizmeti\nNe hakkında bilgi almak istersiniz?" },
  { pattern: /^(nasilsin|naber|ne haber|nasil gidiyor|iyi misin|nasilsiniz)$/, reply: "Teşekkür ederim, iyiyim! Size nasıl yardımcı olabilirim?" },
  { pattern: /^(merhaba(lar)?|selam(lar)?|slm|mrb|sa|selamun aleykum|selamin aleykum|hey|alo)( iyi (gunler|aksamlar|geceler|sabahlar)| gunaydin| kolay gelsin)?( nasilsin| nasilsiniz| naber)?$/, reply: "Merhaba! Ürünler, siparişiniz, kampanyalar veya hizmetlerimiz hakkında size nasıl yardımcı olabilirim?" },
];

export const smallTalkReply = (query) => {
  const text = normalizeSearch(query).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.split(" ").length > 6) return null;
  return SMALL_TALK.find(({ pattern }) => pattern.test(text))?.reply || null;
};
