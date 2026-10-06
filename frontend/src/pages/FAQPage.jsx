import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { HelpCircle, ChevronDown, ShoppingCart, Truck, CreditCard, RotateCcw, Shield, Clock } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const faqData = [
  {
    category: "Sipariş",
    icon: ShoppingCart,
    questions: [
      {
        question: "Sipariş nasıl verilir?",
        answer: "Ürünleri sepete ekleyin, ödeme bilgilerinizi girin ve siparişinizi onaylayın. Siparişiniz otomatik olarak işleme alınacaktır."
      },
      {
        question: "Siparişimi iptal edebilir miyim?",
        answer: "Evet, sipariş teslim edilmeden önce iptal edebilirsiniz. İptal işlemi için müşteri hizmetleri ile iletişime geçin."
      },
      {
        question: "Sipariş durumunu nasıl takip ederim?",
        answer: "Hesabınızdan 'Siparişlerim' bölümünden sipariş durumunuzu takip edebilirsiniz."
      }
    ]
  },
  {
    category: "Teslimat",
    icon: Truck,
    questions: [
      {
        question: "Teslimat süresi ne kadar?",
        answer: "Teslimat süremiz 45 dakika ile 2 saat arasındadır. Yoğunluk durumuna göre bu süre değişebilir."
      },
      {
        question: "Teslimat ücreti var mı?",
        answer: "150₺ üzeri siparişlerde teslimat ücretsizdir. 150₺ altı siparişlerde teslimat ücreti 15₺'dir."
      },
      {
        question: "Hangi bölgelere teslimat yapıyorsunuz?",
        answer: "Şu anda Devrek bölgesine teslimat yapmaktayız. Teslimat bölgelerimiz sürekli genişlemektedir."
      }
    ]
  },
  {
    category: "Ödeme",
    icon: CreditCard,
    questions: [
      {
        question: "Hangi ödeme yöntemlerini kabul ediyorsunuz?",
        answer: "Kredi kartı, banka kartı, nakit ödeme ve dijital cüzdan ödemelerini kabul ediyoruz."
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
        answer: "Telefon, e-posta veya canlı destek ile 7/24 müşteri hizmetlerimize ulaşabilirsiniz."
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

const sections = faqData.map((category, index) => ({ id: `sss-${index + 1}`, label: category.category }));

const FAQPage = () => {
  const [openIndex, setOpenIndex] = useState(null);

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
            <p>Müşteri hizmetlerimiz 7/24 hizmetinizdedir. Sorularınız için bizimle iletişime geçin.</p>
          </div>
          <div className="legal-help-actions">
            <a href="tel:+90XXXXXXXXX">
              <Clock aria-hidden="true" />
              Hemen Ara
            </a>
            <a className="is-ghost" href="mailto:info@benimmarketim.com">
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
