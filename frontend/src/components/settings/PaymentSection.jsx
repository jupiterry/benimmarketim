// Ödeme bölümü: müşteri uygulamada sipariş verirken kapıda nakit, kapıda kart (POS)
// ya da havale/EFT seçer. Havale/EFT seçildiğinde uygulamada buradaki hesap bilgileri gösterilir.
import { Banknote, Building2, CreditCard, Landmark } from "lucide-react";
import { Field, Input, SectionHead, StatusPill, useSettingsForm } from "./fields";
import { formatIban, normalizeIban } from "./settingsModel";

const METHODS = [
  { icon: Banknote, title: "Kapıda nakit", text: "Teslimatta nakit ödeme." },
  { icon: CreditCard, title: "Kapıda kart (POS)", text: "Teslimatta POS cihazıyla kartla ödeme." },
  { icon: Landmark, title: "Havale / EFT", text: "Müşteri aşağıdaki hesaba gönderir; açıklamaya sipariş numarasını yazar." },
];

export default function PaymentSection() {
  const form = useSettingsForm();
  const bank = form.draft.bankTransfer || {};
  const ready = /^TR\d{24}$/.test(normalizeIban(bank.iban)) && String(bank.accountName || "").trim();

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead
          icon={CreditCard}
          title="Ödeme yöntemleri"
          description="Müşteri uygulamada sipariş verirken bunlardan birini seçmek zorunda. Seçilen yöntem sipariş kartında ve sipariş alarmında görünür."
        />
        <div className="ui-panel-body">
          <ul className="stg-pay-methods">
            {METHODS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="stg-pay-icon"><Icon /></span>
                <span><strong>{title}</strong><small>{text}</small></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ui-panel">
        <SectionHead
          icon={Building2}
          title="Havale / EFT hesabı"
          description="Havale/EFT seçen müşteriye sipariş ekranında ve sipariş sonrasında gösterilir."
          aside={<StatusPill tone={ready ? "ok" : "warn"}>{ready ? "Müşteriye gösteriliyor" : "IBAN girilmedi"}</StatusPill>}
        />
        <div className="ui-panel-body stg-stack">
          <div className="stg-grid-2">
            <Field path="bankTransfer.accountName" label="Hesap sahibi" hint="Banka hesabındaki ad / unvan">
              <Input path="bankTransfer.accountName" maxLength={120} placeholder="Ör. Benim Marketim – Ad Soyad" autoComplete="off" />
            </Field>
            <Field path="bankTransfer.bankName" label="Banka">
              <Input path="bankTransfer.bankName" maxLength={80} placeholder="Ör. Ziraat Bankası" autoComplete="off" />
            </Field>
          </div>
          <Field path="bankTransfer.iban" label="IBAN" hint="TR ile başlayan 26 karakter; boşluklu ya da boşluksuz yazabilirsiniz.">
            <Input
              path="bankTransfer.iban"
              className="ui-mono"
              maxLength={34}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              autoComplete="off"
              spellCheck={false}
              parse={(value) => formatIban(value)}
            />
          </Field>
          {!ready && (
            <p className="ui-hint">IBAN ve hesap sahibi girilmezse müşteri havale/EFT seçtiğinde hesap bilgisinin mesajla iletileceği yazar.</p>
          )}
        </div>
      </section>
    </div>
  );
}
