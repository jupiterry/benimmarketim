import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { useCartStore } from "../stores/useCartStore";
import CartItem from "../components/CartItem";
import { useState } from "react";
import PeopleAlsoBought from "../components/PeopleAlsoBought";
import { motion } from "framer-motion";
import OrderSummary from "../components/OrderSummary";
import GiftCouponCard from "../components/GiftCouponCard";

const CartPage = () => {
  const { cart } = useCartStore();
  const [note, setNote] = useState("");

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gray-900">
      <div className="container mx-auto px-4">
        {/* Muhteşem Header */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl">
              <ShoppingCart className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 bg-clip-text text-transparent">
                Sepetim
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-12 h-1 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full"></div>
                <span className="text-gray-400 text-lg">
                  {cart.length} {cart.length === 1 ? 'ürün' : 'ürün'}
                </span>
                <div className="w-12 h-1 bg-gradient-to-r from-green-600 to-teal-500 rounded-full"></div>
              </div>
            </div>
            <div className="w-16 h-16 bg-gradient-to-r from-green-600 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
              <span className="text-2xl">🛍️</span>
            </div>
          </div>
          
          {cart.length > 0 && (
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Seçtiğiniz ürünleri gözden geçirin ve siparişinizi tamamlayın! ✨
            </motion.p>
          )}
        </motion.div>
        
        <div className="mt-6 sm:mt-8 md:gap-6 lg:flex lg:items-start xl:gap-8">
          <motion.div
            className="mx-auto w-full flex-none lg:max-w-2xl xl:max-w-4xl"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {cart.length === 0 ? (
              <EmptyCartUI />
            ) : (
              <div className="space-y-6">
                {cart.map((item) => (
                  <CartItem key={item._id} item={item} />
                ))}
              </div>
            )}
          </motion.div>

          {cart.length > 0 && (
            <motion.div
              className="mx-auto mt-6 max-w-4xl flex-1 space-y-6 lg:mt-0 lg:w-full"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <OrderSummary note={note} setNote={setNote} />
              <GiftCouponCard />
            </motion.div>
          )}
        </div>

        {/* Önerilen Ürünler */}
        {cart.length > 0 && (
          <motion.div 
            className="mt-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <PeopleAlsoBought />
          </motion.div>
        )}
      </div>
    </div>
  );
};

const EmptyCartUI = () => (
  <div className="relative overflow-hidden">
    {/* Arka Plan Gradient */}
    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-teal-500/10 rounded-3xl"></div>
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/20 to-gray-900/40 rounded-3xl"></div>
    
    <motion.div
      className="relative bg-gray-900/60 rounded-3xl p-12 backdrop-blur-xl border border-emerald-500/20 shadow-2xl"
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, type: "spring" }}
    >
      {/* Floating Icons */}
      <div className="absolute top-8 left-8 opacity-20">
        <motion.div
          animate={{ rotate: 360, y: [-10, 10, -10] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          🛒
        </motion.div>
      </div>
      <div className="absolute top-12 right-12 opacity-20">
        <motion.div
          animate={{ rotate: -360, y: [10, -10, 10] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        >
          🛍️
        </motion.div>
      </div>
      <div className="absolute bottom-8 left-16 opacity-20">
        <motion.div
          animate={{ rotate: 360, x: [-5, 5, -5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          🎁
        </motion.div>
      </div>

      <div className="text-center space-y-8">
        {/* Main Icon */}
        <motion.div
          className="relative mx-auto w-32 h-32"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, type: "spring" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full opacity-20 animate-pulse"></div>
          <div className="relative w-full h-full bg-gradient-to-br from-emerald-500/30 to-green-600/30 rounded-full flex items-center justify-center border border-emerald-500/30">
            <ShoppingCart className="h-16 w-16 text-emerald-400" />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h3 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 bg-clip-text text-transparent mb-4">
            Sepetiniz Boş
          </h3>
          <p className="text-xl text-gray-300 max-w-md mx-auto leading-relaxed">
            Harika ürünlerimizi keşfetmek için alışverişe başlayın! 🌟
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🚚</span>
            </div>
            <p className="text-gray-400 text-sm">Hızlı Teslimat</p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">💎</span>
            </div>
            <p className="text-gray-400 text-sm">Kaliteli Ürünler</p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🎯</span>
            </div>
            <p className="text-gray-400 text-sm">Uygun Fiyatlar</p>
          </div>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <Link to="/">
            <motion.button
              whileHover={{ 
                scale: 1.05, 
                boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)",
                y: -2
              }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 flex items-center gap-3 mx-auto shadow-xl"
            >
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <ShoppingCart className="h-6 w-6" />
              </motion.div>
              <span className="text-lg">Alışverişe Başla</span>
              <span className="text-2xl">🚀</span>
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </motion.div>
  </div>
);

export default CartPage;