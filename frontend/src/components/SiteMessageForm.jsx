import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

const EMPTY = { name: "", email: "", phone: "", topic: "", message: "", website: "" };

// İletişim ve KVKK başvuru sayfalarının ortak formu. Kayıt sunucuda saklanır ve yönetici panelinde görünür.
export default function SiteMessageForm({ kind, topics, topicLabel = "Konu", messageLabel = "Mesaj", messagePlaceholder, phoneRequired = false, submitLabel = "Gönder", successTitle, successText, consent }) {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState(null);
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    try {
      setSending(true);
      const { data } = await axios.post("/site-messages", { kind, ...form });
      setReference(data.reference || "");
      setForm(EMPTY);
    } catch (error) {
      toast.error(error.response?.data?.message || "Gönderilemedi. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setSending(false);
    }
  };

  if (reference !== null) {
    return (
      <div className="legal-success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <h3>{successTitle}</h3>
        <p>{successText}</p>
        {reference && <p className="legal-success-ref">Kayıt numaranız: <strong>{reference}</strong></p>}
        <button type="button" className="legal-btn legal-btn--ghost" onClick={() => setReference(null)}>Yeni form doldur</button>
      </div>
    );
  }

  return (
    <form className="legal-form" onSubmit={submit}>
      <div className="legal-form-row">
        <label className="legal-field">
          <span>Ad Soyad *</span>
          <input type="text" name="name" value={form.name} onChange={change} required minLength={3} maxLength={80} autoComplete="name" placeholder="Adınız ve soyadınız" />
        </label>
        <label className="legal-field">
          <span>E-posta *</span>
          <input type="email" name="email" value={form.email} onChange={change} required maxLength={120} autoComplete="email" placeholder="ornek@email.com" />
        </label>
      </div>
      <div className="legal-form-row">
        <label className="legal-field">
          <span>Telefon{phoneRequired ? " *" : ""}</span>
          <input type="tel" name="phone" value={form.phone} onChange={change} required={phoneRequired} maxLength={20} autoComplete="tel" placeholder="05xx xxx xx xx" />
        </label>
        <label className="legal-field">
          <span>{topicLabel} *</span>
          <select name="topic" value={form.topic} onChange={change} required>
            <option value="">Seçin</option>
            {topics.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
          </select>
        </label>
      </div>
      <label className="legal-field">
        <span>{messageLabel} *</span>
        <textarea name="message" value={form.message} onChange={change} required minLength={10} maxLength={2000} rows={5} placeholder={messagePlaceholder} />
      </label>
      {/* Botlar için tuzak alan; insanlar görmez */}
      <input type="text" name="website" value={form.website} onChange={change} tabIndex={-1} autoComplete="off" aria-hidden="true" className="legal-trap" />
      {consent && <p className="legal-form-note">{consent}</p>}
      <button type="submit" className="legal-btn" disabled={sending}>
        <Send aria-hidden="true" />
        {sending ? "Gönderiliyor…" : submitLabel}
      </button>
    </form>
  );
}
