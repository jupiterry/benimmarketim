import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Mail, Phone, MapPin, Clock, Send, MessageCircle, Headphones } from 'lucide-react';
import toast from 'react-hot-toast';

const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Form gönderme işlemi burada yapılacak
    toast.success('Mesajınız başarıyla gönderildi!');
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <>
      <Helmet>
        <title>İletişim - Benim Marketim</title>
        <meta name="description" content="Benim Marketim ile iletişime geçin. Sorularınız, önerileriniz ve şikayetleriniz için bizimle iletişim kurun." />
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
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center shadow-2xl">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
                  İletişim
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Bizimle İletişime Geçin
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-cyan-600 to-teal-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-cyan-600 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
                <Headphones className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Sorularınız, önerileriniz ve şikayetleriniz için bizimle iletişime geçebilirsiniz. Size en kısa sürede dönüş yapacağız.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* İletişim Bilgileri */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
                <h2 className="text-2xl font-bold text-white mb-6">İletişim Bilgileri</h2>
                
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                      <Mail className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-blue-300">E-posta</h3>
                      <p className="text-gray-300">info@benimmarketim.com</p>
                      <p className="text-gray-300">destek@benimmarketim.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-green-300">Telefon</h3>
                      <p className="text-gray-300">+90 (XXX) XXX XX XX</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-purple-300">Adres</h3>
                      <p className="text-gray-300">Benim Marketim</p>
                      <p className="text-gray-300">Devrek, Zonguldak</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                    <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-orange-300">Çalışma Saatleri</h3>
                      <p className="text-gray-300">Pazartesi - Cuma: 08:00 - 23:00</p>
                      <p className="text-gray-300">Cumartesi: 09:00 - 23:00</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hızlı İletişim */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
                <h2 className="text-2xl font-bold text-white mb-6">Hızlı İletişim</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <a 
                    href="tel:+90XXXXXXXXX" 
                    className="flex items-center gap-3 p-4 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-xl transition-all duration-300 group"
                  >
                    <Phone className="w-5 h-5 text-green-400 group-hover:text-green-300" />
                    <span className="text-green-300 font-medium">Ara</span>
                  </a>
                  
                  <a 
                    href="mailto:info@benimmarketim.com" 
                    className="flex items-center gap-3 p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl transition-all duration-300 group"
                  >
                    <Mail className="w-5 h-5 text-blue-400 group-hover:text-blue-300" />
                    <span className="text-blue-300 font-medium">E-posta</span>
                  </a>
                </div>
              </div>
            </motion.div>

            {/* İletişim Formu */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <h2 className="text-2xl font-bold text-white mb-6">Mesaj Gönder</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      Ad Soyad *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      placeholder="Adınız ve soyadınız"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      E-posta *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      placeholder="ornek@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Konu *
                  </label>
                  <select
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    <option value="">Konu seçin</option>
                    <option value="siparis">Sipariş Sorunu</option>
                    <option value="teslimat">Teslimat Sorunu</option>
                    <option value="iade">İade/Değişim</option>
                    <option value="urun">Ürün Hakkında</option>
                    <option value="genel">Genel Soru</option>
                    <option value="sikayet">Şikayet</option>
                    <option value="oneri">Öneri</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Mesaj *
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows="5"
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                    placeholder="Mesajınızı buraya yazın..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/25"
                >
                  <Send className="w-5 h-5" />
                  Mesaj Gönder
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ContactPage;
