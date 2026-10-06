import { MAX_PROMPT_LENGTH, suggestCartForPrompt } from "../services/ai/cartAssistant.service.js";

// POST /api/cart-assistant/suggest  { prompt, budget? }
export const suggestCart = async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (prompt.length < 3) return res.status(400).json({ success: false, message: "Ne almak istediğinizi yazar mısınız?" });
  if (prompt.length > MAX_PROMPT_LENGTH) return res.status(400).json({ success: false, message: `İsteğiniz en fazla ${MAX_PROMPT_LENGTH} karakter olabilir.` });
  const rawBudget = req.body?.budget;
  const budget = rawBudget === undefined || rawBudget === null || rawBudget === "" ? null : Number(rawBudget);
  if (budget !== null && !(budget >= 20 && budget <= 100000)) return res.status(400).json({ success: false, message: "Bütçe 20 TL ile 100.000 TL arasında olmalıdır." });
  try {
    const result = await suggestCartForPrompt({ prompt, budget, userId: req.user._id });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Sepet asistanı hatası:", error.message);
    res.status(500).json({ success: false, message: "Sepet şu anda hazırlanamadı. Lütfen biraz sonra tekrar deneyin." });
  }
};
