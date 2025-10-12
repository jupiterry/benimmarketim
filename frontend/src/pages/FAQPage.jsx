import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { HelpCircle, ChevronDown, ChevronUp, ShoppingCart, Truck, CreditCard, RotateCcw, Shield, Clock } from 'lucide-react';

const FAQPage = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const faqData = [
    {
      category: "Sipariş",
      icon: ShoppingCart,
      color: "blue",
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
      color: "green",
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
      color: "purple",
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
      color: "red",
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
      color: "emerald",
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
      color: "orange",
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

  const toggleQuestion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const getColorClasses = (color) => {
    const colors = {
      blue: "from-blue-500 to-blue-600",
      green: "from-green-500 to-green-600", 
      purple: "from-purple-500 to-purple-600",
      red: "from-red-500 to-red-600",
      emerald: "from-emerald-500 to-emerald-600",
      orange: "from-orange-500 to-orange-600"
    };
    return colors[color] || "from-gray-500 to-gray-600";
  };

  return (
    <>
      <Helmet>
        <title>Sıkça Sorulan Sorular - Benim Marketim</title>
        <meta name="description" content="Benim Marketim hakkında sıkça sorulan sorular ve cevapları." />
      </Helmet>

      <div className="min-h-screen pt-28 pb-16 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl">
                <HelpCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  Sıkça Sorulan Sorular
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    SSS
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full flex items-center justify-center shadow-2xl">
                <Clock className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              En çok merak edilen sorular ve cevapları burada. Aradığınız cevabı bulamazsanız bizimle iletişime geçin.
            </motion.p>
          </motion.div>

          {/* FAQ Kategorileri */}
          <div className="space-y-8">
            {faqData.map((category, categoryIndex) => (
              <motion.div
                key={categoryIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * categoryIndex }}
                className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 bg-gradient-to-r ${getColorClasses(category.color)} rounded-xl flex items-center justify-center`}>
                    <category.icon className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">{category.category}</h2>
                </div>

                <div className="space-y-4">
                  {category.questions.map((item, questionIndex) => (
                    <div key={questionIndex} className="border border-gray-700/50 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleQuestion(categoryIndex * 100 + questionIndex)}
                        className="w-full p-4 text-left bg-gray-700/30 hover:bg-gray-700/50 transition-colors duration-200 flex items-center justify-between"
                      >
                        <span className="text-white font-medium">{item.question}</span>
                        {openIndex === categoryIndex * 100 + questionIndex ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      
                      <AnimatePresence>
                        {openIndex === categoryIndex * 100 + questionIndex && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 bg-gray-800/50 border-t border-gray-700/50">
                              <p className="text-gray-300 leading-relaxed">{item.answer}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* İletişim */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl p-8 mt-8"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-4">Aradığınız Cevabı Bulamadınız mı?</h2>
              <p className="text-gray-300 mb-6">
                Müşteri hizmetlerimiz 7/24 hizmetinizdedir. Sorularınız için bizimle iletişime geçin.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a 
                  href="tel:+90XXXXXXXXX" 
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors duration-300"
                >
                  <Clock className="w-5 h-5" />
                  Hemen Ara
                </a>
                <a 
                  href="mailto:info@benimmarketim.com" 
                  className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors duration-300"
                >
                  <HelpCircle className="w-5 h-5" />
                  E-posta Gönder
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default FAQPage;
