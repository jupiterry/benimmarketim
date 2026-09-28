const DEFAULT_TIMEOUT_MS = 15000;

const requestJson = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
    return body;
  } finally { clearTimeout(timeout); }
};

export const AI_TOOL_DEFINITIONS = [
  ["searchProducts", "Ürün adıyla canlı ürün, stok ve güncel fiyat arar.", { query: { type: "string", description: "Ürün adı veya arama terimi" } }, ["query"]],
  ["getProductDetails", "Kimliği bilinen ürünün public detaylarını getirir.", { productId: { type: "string" } }, ["productId"]],
  ["getProductStock", "Kimliği bilinen ürünün stok durumunu getirir.", { productId: { type: "string" } }, ["productId"]],
  ["getProductPrice", "Kimliği bilinen ürünün geçerli fiyatını getirir.", { productId: { type: "string" } }, ["productId"]],
  ["getMyActiveOrders", "Giriş yapmış kullanıcının aktif siparişlerini getirir.", {}, []],
  ["getMyLastOrder", "Giriş yapmış kullanıcının son siparişini getirir.", {}, []],
  ["getOrderStatus", "Siparişin giriş yapmış kullanıcıya ait olması koşuluyla durumunu getirir.", { orderId: { type: "string" } }, ["orderId"]],
  ["getOrderDetails", "Siparişin giriş yapmış kullanıcıya ait olması koşuluyla detayını getirir.", { orderId: { type: "string" } }, ["orderId"]],
  ["getActiveCampaigns", "Şu anda aktif kampanyaları getirir.", {}, []],
  ["getCouponInfo", "Kupon kodunun giriş yapmış kullanıcı için uygunluğunu kontrol eder.", { code: { type: "string" } }, ["code"]],
  ["getStoreInfo", "Sipariş saatleri, sipariş açık durumu, minimum tutar ve public teslimat noktası ayarlarını getirir.", {}, []],
  ["getMyCart", "Giriş yapmış kullanıcının sepetini ve gerçek toplamını getirir.", {}, []],
].map(([name, description, properties, required]) => ({
  type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
}));

export class OpenAiCompatibleProvider {
  constructor({ name, url, apiKey, model, extraHeaders = {} }) { Object.assign(this, { name, url, apiKey, model, extraHeaders }); }
  async complete(messages, tools = AI_TOOL_DEFINITIONS) {
    if (!this.apiKey) throw new Error("AI_API_KEY_MISSING");
    const body = await requestJson(this.url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
      body: JSON.stringify({ model: this.model, messages, ...(tools.length ? { tools, tool_choice: "auto" } : {}), temperature: 0.15, max_tokens: 450 }),
    });
    const message = body.choices?.[0]?.message;
    if (!message || (!message.content?.trim() && !message.tool_calls?.length)) throw new Error("AI_EMPTY_RESPONSE");
    return { role: "assistant", content: message.content?.trim() || "", ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) };
  }
}

const geminiTools = (tools) => [{ functionDeclarations: tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, parameters: { type: "OBJECT", properties: Object.fromEntries(Object.entries(tool.function.parameters.properties).map(([key, value]) => [key, { type: value.type.toUpperCase(), ...(value.description ? { description: value.description } : {}) }])), required: tool.function.parameters.required } })) }];

class GeminiProvider {
  constructor({ model, apiKey }) { this.name = "gemini"; this.model = model; this.apiKey = apiKey; }
  async complete(messages, tools = AI_TOOL_DEFINITIONS) {
    if (!this.apiKey) throw new Error("AI_API_KEY_MISSING");
    const system = messages.find((message) => message.role === "system")?.content || "";
    const contents = [];
    for (const message of messages.filter((item) => item.role !== "system")) {
      if (message.role === "tool") {
        contents.push({ role: "user", parts: [{ functionResponse: { name: message.name, response: { result: message.content } } }] });
      } else if (message.role === "assistant" && message.tool_calls?.length) {
        contents.push({ role: "model", parts: message.tool_calls.map((call) => ({ functionCall: { name: call.function.name, args: JSON.parse(call.function.arguments || "{}") } })) });
      } else {
        contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content || "" }] });
      }
    }
    const body = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, ...(tools.length ? { tools: geminiTools(tools), toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}), generationConfig: { temperature: 0.15, maxOutputTokens: 450 } }),
    });
    const parts = body.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((part) => part.functionCall).map((part, index) => ({ id: `gemini-${Date.now()}-${index}`, type: "function", function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) } }));
    const text = parts.filter((part) => part.text).map((part) => part.text).join("").trim();
    if (!text && !calls.length) throw new Error("AI_EMPTY_RESPONSE");
    return { role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) };
  }
}

export const createAiProvider = ({ provider, model }) => {
  if (provider === "openrouter") return new OpenAiCompatibleProvider({ name: provider, model, apiKey: process.env.OPENROUTER_API_KEY, url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://devrekbenimmarketim.com", "X-Title": "Benim Marketim" } });
  if (provider === "gemini") return new GeminiProvider({ model, apiKey: process.env.GEMINI_API_KEY });
  return new OpenAiCompatibleProvider({ name: "groq", model, apiKey: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions" });
};
