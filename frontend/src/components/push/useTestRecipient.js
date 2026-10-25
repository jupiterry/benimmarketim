// "Test gönder" düğmelerinin ortak alıcısı (otomasyon kartları ve tek seferlik bildirim denemesi).
// Alıcı otomatik bildirim ayarlarında saklanır (GET/PUT /api/notification-automations/settings → testRecipientId).
// Bildirim gönder ekranı bu kancayı bir kez kurar ve iki sekmeye de aynı nesneyi verir; böylece bir yerde yapılan
// değişiklik öbür yerde de görünür. AutomationPanel kendi ayar yüklemesinin yanıtını sync() ile aktarır (ek istek yok).
import { useCallback, useRef, useState } from "react";
import axios from "../../lib/axios";

const INITIAL = { loaded: false, loading: false, error: "", recipient: null, self: null, missing: false };

/** Düğmelerde gösterilecek kısa ad: seçili hesabın adı, seçim yoksa "Kendime". */
export const testRecipientName = (state) => {
  const recipient = state?.recipient;
  if (!recipient) return "Kendime";
  return recipient.name || recipient.email || recipient.phone || "Seçili hesap";
};

export default function useTestRecipient() {
  const [state, setState] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  // Ayarlar yanıtından (GET ya da testRecipientId içeren PUT) alıcıyı alır; alan yoksa dokunmaz
  const sync = useCallback((body) => {
    if (!body || !("testRecipient" in body)) return;
    loadedRef.current = true;
    setState((current) => ({
      ...current,
      loaded: true,
      loading: false,
      error: "",
      recipient: body.testRecipient || null,
      self: body.testRecipientSelf ?? current.self,
      missing: Boolean(body.testRecipientMissing),
    }));
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const { data } = await axios.get("/notification-automations/settings");
      sync(data);
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.response?.data?.message || "Test alıcısı alınamadı." }));
    } finally {
      loadingRef.current = false;
    }
  }, [sync]);

  // Henüz yüklenmediyse bir kez yükler (sekme değişimlerinde tekrar istek atmaz)
  const ensure = useCallback(() => {
    if (!loadedRef.current) load();
  }, [load]);

  /** id: kullanıcı kimliği ya da null ("Kendim"). Hata fırlatırsa çağıran bildirir. */
  const save = useCallback(async (id) => {
    setSaving(true);
    try {
      const { data } = await axios.put("/notification-automations/settings", { testRecipientId: id || null });
      sync(data);
      return data;
    } finally {
      setSaving(false);
    }
  }, [sync]);

  return { ...state, saving, load, ensure, sync, save };
}
