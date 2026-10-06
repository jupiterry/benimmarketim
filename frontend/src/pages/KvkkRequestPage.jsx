import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ClipboardList, FileText, ShieldCheck } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';
import SiteMessageForm from '../components/SiteMessageForm';

const sections = [
  { id: "nasil-isler", label: "Başvuru nasıl işler?" },
  { id: "basvuru-formu", label: "Başvuru formu" },
];

// Seçenekler KVKK Aydınlatma Metni'ndeki "Veri Sahibinin Hakları" başlıklarıyla aynıdır.
const requestTypes = [
  { value: "bilgi", label: "Bilgi talep etme" },
  { value: "erisim", label: "Verilerime erişim" },
  { value: "duzeltme", label: "Verilerimin düzeltilmesi" },
  { value: "silme", label: "Verilerimin silinmesi" },
  { value: "itiraz", label: "İşlemeye itiraz" },
  { value: "diger", label: "Diğer" },
];

const KvkkRequestPage = () => {
  return (
    <>
      <Helmet>
        <title>KVKK Başvuru Formu - Benim Marketim</title>
        <meta name="description" content="Kişisel verilerinizle ilgili taleplerinizi Benim Marketim'e iletmek için KVKK başvuru formu." />
      </Helmet>

      <LegalLayout
        title="KVKK Başvuru Formu"
        subtitle="Kişisel Verilerin Korunması"
        description="Kişisel verilerinizle ilgili talebinizi bu formla bize iletebilirsiniz."
        icon={ShieldCheck}
        toc={sections}
      >
        <section id="nasil-isler" className="legal-section">
          <div className="legal-section-head">
            <ClipboardList className="legal-icon" />
            <h2>Başvuru nasıl işler?</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card legal-card--row">
              <div className="legal-step">1</div>
              <p className="legal-text">Formu doldurup talebinizi açıkça yazın.</p>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">2</div>
              <p className="legal-text">Başvurunun size ait olduğunu doğrulamak için verdiğiniz e-posta veya telefondan sizinle iletişime geçeriz.</p>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">3</div>
              <p className="legal-text">Başvurularınız 30 gün içinde yanıtlanacaktır.</p>
            </div>
          </div>
          <p className="legal-text legal-text--sm legal-text--top">
            Haklarınızın tamamı için <Link className="legal-link" to="/kvkk">KVKK Aydınlatma Metni</Link>'ne bakabilirsiniz.
            Yalnızca hesabınızı silmek istiyorsanız <Link className="legal-link" to="/hesap-silme">Hesap ve Veri Silme</Link> sayfasını kullanabilirsiniz.
          </p>
        </section>

        <section id="basvuru-formu" className="legal-section">
          <div className="legal-section-head">
            <FileText className="legal-icon" />
            <h2>Başvuru formu</h2>
          </div>
          <SiteMessageForm
            kind="kvkk"
            topics={requestTypes}
            topicLabel="Talep türü"
            messageLabel="Talebiniz"
            messagePlaceholder="Hangi verilerinizle ilgili ne talep ettiğinizi yazın."
            phoneRequired
            submitLabel="Başvuruyu gönder"
            successTitle="Başvurunuz alındı"
            successText="Kimliğinizi doğrulamak için sizinle iletişime geçeceğiz. Başvurularınız 30 gün içinde yanıtlanacaktır."
            consent="Bu formda paylaştığınız bilgiler yalnızca başvurunuzu yanıtlamak için kullanılır. Lütfen T.C. kimlik numarası veya kart bilgisi gibi bilgileri yazmayın."
          />
        </section>
      </LegalLayout>
    </>
  );
};

export default KvkkRequestPage;
