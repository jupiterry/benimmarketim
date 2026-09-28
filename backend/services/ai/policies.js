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
      else if (titleWords.some((candidate) => word.length >= 5 && distanceAtMostOne(word, candidate))) score += 3.5;
      if (keywordWords.includes(word)) score += 4;
      else if (keywordWords.some((candidate) => word.length >= 5 && distanceAtMostOne(word, candidate))) score += 3;
      if (categoryWords.includes(word)) score += 1.5;
      if (contentWords.includes(word)) score += 0.5;
    }
    return { ...row, score };
  }).filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score || b.priority - a.priority || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);
};

export const unknownAnswerOffer = () => "Bu konuda şu anda doğrulanmış bilgi bulamadım. İsterseniz aşağıdaki Canlı Destek seçeneğine dokunarak ekibimize bağlanabilirsiniz.";
