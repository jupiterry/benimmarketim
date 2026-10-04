import { useEffect, useState } from "react";
import axios from "../lib/axios";

export default function AdminAuditTab() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { axios.get("/orders-analytics/audit").then(({ data }) => setEntries(data.entries || [])).catch(() => setError("İşlem kayıtları yüklenemedi")); }, []);
  return <section className="ui-card"><div className="ui-card-header"><div><h2 className="ui-title">Yönetici işlem kayıtları</h2><p className="ui-subtitle">Son 100 başarılı hassas işlem. Sipariş durumu, teslimat takibi, fiyat, mağaza ayarı ve müşteri düzenleme yetkisi yalnızca yönetici hesaplarındadır. Müşteri hesapları bu işlemlere erişemez.</p></div></div>{error && <p role="alert" className="ui-banner ui-banner--danger" style={{ margin: 16 }}>{error}</p>}<div>{entries.map(entry => <div key={entry._id} className="ui-list-row" style={{ display: "block" }}><p className="ui-text-sm ui-wrap-anywhere"><strong>{entry.action}</strong> · {entry.target}</p><p className="ui-hint">{entry.actor?.name || entry.actor?.email || "Bilinmeyen yönetici"} · {new Date(entry.createdAt).toLocaleString("tr-TR")}</p></div>)}{!error && entries.length === 0 && <p className="ui-empty">Henüz kayıt yok.</p>}</div></section>;
}
