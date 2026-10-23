import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { HelpCircle, ChevronDown, ShoppingCart, Truck, CreditCard, RotateCcw, Shield, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout';
import { useSettingsStore } from '../stores/useSettingsStore';
import { company, isPlaceholder, orderHoursText, DELIVERY_ZONES_PATH } from '../data/company';

const zonesLink = <Link className="legal-link" to={DELIVERY_ZONES_PATH}>Teslimat bölgeleri</Link>;

// hours: sipariş saatleri metni (ayarlardan)
const buildFaqData = (hours) => [
  {
    category: "Sipariş",
    icon: ShoppingCart,
    questions: [
      {
        question: "Sipariş nasıl verilir?",
        answer: "Siparişler yalnızca Benim Marketim mobil uygulamasından verilir. Ürünleri sepete ekleyin, teslimat bölgenizi ve ödeme yönteminizi seçin, sepet özetini kontrol edip siparişi onaylayın. Web sitesinden sipariş alınmaz."
      },
      {
        question: "Sipariş saatleriniz nedir?",
        answer: `Her gün ${hours} saatleri arasında sipariş alıyoruz. Güncel saatler uygulamada da görünür.`
      },
      {
        question: "Siparişimi iptal edebilir miyim?",
        answer: "Evet, sipariş teslim edilmeden önce iptal edebilirsiniz. İptal için uygulamadaki sipariş ekranını ya da canlı desteği kullanın."
      },
      {
        question: "Sipariş durumunu nasıl takip ederim?",
        answer: "Uygulamadaki 'Siparişlerim' bölümünden sipariş durumunuzu takip edebilirsiniz."
      }
    ]
  },
  {
    category: "Teslimat",
    icon: Truck,
    questions: [
      {
        question: "Hangi bölgelere teslimat yapıyorsunuz?",
        answer: <>Teslimat yaptığımız bölgeler {zonesLink} sayfasında listelenir; tamamı Zonguldak’ın Devrek ilçesindedir. Bölgeniz listede yoksa şu an oraya teslimat yapamıyoruz.</>
      },
      {
        question: "Teslimat ücreti var mı?",
        answer: <>Teslimat ücreti bölgeye göre değişebilir: bazı bölgelerde teslimat ücretsizdir, bazılarında belirli bir sepet tutarının üstünde ücretsiz olur. Her bölgenin ücreti {zonesLink} sayfasında yazar; ücret varsa siparişi onaylamadan önce uygulamada sepet özetinde gösterilir.</>
      },
      {
        question: "Teslimat süresi ne kadar?",
        answer: "Teslimat süresi bölgeye ve yoğunluğa göre değişir. Bölgenin tahmini teslimat süresi girilmişse Teslimat bölgeleri sayfasında ve uygulamada görünür; hava ve yol durumu süreyi uzatabilir."
      },
      {
        question: "Minimum sipariş tutarı var mı?",
        answer: "Evet. Genel minimum sepet tutarı uygulamada gösterilir; bazı bölgelerde farklı bir minimum geçerli olabilir. Bölgenin minimumu Teslimat bölgeleri sayfasında yazar."
      }
    ]
  },
  {
    category: "Ödeme",
    icon: CreditCard,
    questions: [
      {
        question: "Hangi ödeme yöntemlerini kabul ediyorsunuz?",
        answer: "Uygulamada sipariş verirken kapıda nakit, kapıda kart ya da havale/EFT seçeneklerinden birini seçebilirsiniz."
      },
      {
        question: "Ödeme güvenli mi?",
        answer: "Evet, tüm ödemeler SSL şifreleme ile korunur ve PCI DSS standartlarına uygun işlenir."
      },
      {
        question: "Fatura alabilir miyim?",
        answer: "Evet, faturalar e-posta ile gönderilir. Kurumsal faturalar için müşteri hizmetleri ile iletişime geçin."
      }
    ]
  },
  {
    category: "İade",
    icon: RotateCcw,
    questions: [
      {
        question: "İade sürem ne kadar?",
        answer: "14 gün içinde iade talebinde bulunabilirsiniz. Ürün orijinal ambalajında ve kullanılmamış olmalıdır."
      },
      {
        question: "İade işlemi nasıl yapılır?",
        answer: "Müşteri hizmetleri ile iletişime geçin, iade talebiniz onaylandıktan sonra ürünü ücretsiz kargo ile iade edin."
      },
      {
        question: "Para iadesi ne zaman yapılır?",
        answer: "Para iadesi 7-10 iş günü içinde hesabınıza yatırılır. İade yöntemi ödeme yönteminizle aynıdır."
      }
    ]
  },
  {
    category: "Güvenlik",
    icon: Shield,
    questions: [
      {
        question: "Kişisel bilgilerim güvende mi?",
        answer: "Evet, tüm kişisel bilgileriniz SSL şifreleme ile korunur ve KVKK uyumlu şekilde işlenir."
      },
      {
        question: "Hesabımı nasıl güvende tutabilirim?",
        answer: "Güçlü şifre kullanın, şifrenizi kimseyle paylaşmayın ve şüpheli aktivitelerde hemen bizimle iletişime geçin."
      }
    ]
  },
  {
    category: "Genel",
    icon: HelpCircle,
    questions: [
      {
        question: "Müşteri hizmetlerine nasıl ulaşabilirim?",
        answer: `Uygulamadaki canlı destekten, ${company.email} adresinden ya da iletişim sayfasındaki formdan bize ulaşabilirsiniz. Sipariş saatlerimiz (${hours}) içinde daha hızlı dönüş yaparız.`
      },
      {
        question: "Ürün kalitesi nasıl garanti ediliyor?",
        answer: "Tüm ürünlerimiz seçilmiş tedarikçilerden gelir ve kalite kontrolünden geçer. Taze gıda ürünleri günlük olarak tedarik edilir."
      },
      {
        question: "Kampanya ve indirimler nasıl takip edilir?",
        answer: "E-posta bültenimize abone olun, sosyal medya hesaplarımızı takip edin ve uygulamamızı indirin."
      }
    ]
  }
];

const FAQPage = () => {
  const [openIndex, setOpenIndex] = useState(null);
  const settings = useSettingsStore((state) => state.settings);
  const faqData = buildFaqData(orderHoursText(settings));
  const sections = faqData.map((category, index) => ({ id: `sss-${index + 1}`, label: category.category }));

  const toggleQuestion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      <Helmet>
        <title>Sıkça Sorulan Sorular - Benim Marketim</title>
        <meta name="description" content="Benim Marketim hakkında sıkça sorulan sorular ve cevapları." />
      </Helmet>

      <LegalLayout
        title="Sıkça Sorulan Sorular"
        subtitle="SSS"
        description="En çok merak edilen sorular ve cevapları burada. Aradığınız cevabı bulamazsanız bizimle iletişime geçin."
        icon={HelpCircle}
        toc={sections}
        docs={false}
        help={false}
      >
        {faqData.map((category, categoryIndex) => (
          <section key={categoryIndex} id={sections[categoryIndex].id} className="legal-section">
            <div className="legal-section-head">
              <category.icon className="legal-icon" />
              <h2>{category.category}</h2>
            </div>
            <div className="legal-stack legal-stack--tight">
              {category.questions.map((item, questionIndex) => {
                const index = categoryIndex * 100 + questionIndex;
                const open = openIndex === index;
                return (
                  <div key={questionIndex} className={`legal-faq${open ? " is-open" : ""}`}>
                    <button type="button" onClick={() => toggleQuestion(index)} aria-expanded={open} aria-controls={`sss-yanit-${index}`}>
                      <span>{item.question}</span>
                      <ChevronDown aria-hidden="true" />
                    </button>
                    {open && (
                      <div id={`sss-yanit-${index}`} className="legal-faq-answer">
                        <p className="legal-text">{item.answer}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* İletişim */}
        <div className="legal-help">
          <div>
            <strong>Aradığınız Cevabı Bulamadınız mı?</strong>
            <p>Sorularınız için bize yazın; sipariş saatlerimizde ({orderHoursText(settings)}) daha hızlı dönüş yaparız.</p>
          </div>
          <div className="legal-help-actions">
            {!isPlaceholder(company.phone) && (
              <a href={company.phoneHref}>
                <Clock aria-hidden="true" />
                Hemen Ara
              </a>
            )}
            <a className="is-ghost" href={`mailto:${company.email}`}>
              <HelpCircle aria-hidden="true" />
              E-posta Gönder
            </a>
          </div>
        </div>
      </LegalLayout>
    </>
  );
};

export default FAQPage;
