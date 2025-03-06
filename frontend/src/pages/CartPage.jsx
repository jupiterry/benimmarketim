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
    <div className="min-h-screen pt-24 pb-32 md:pb-16 bg-gray-900">
      <div className="container mx-auto px-4">
        
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
          <div className="mt-16">
            <h2 className="text-2xl font-semibold text-white mb-8">Bunlar da İlginizi Çekebilir</h2>
            <PeopleAlsoBought />
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyCartUI = () => (
  <motion.div
    className="flex flex-col items-center justify-center space-y-4 py-16 bg-gray-800/50 rounded-xl p-8"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <ShoppingCart className="h-24 w-24 text-gray-300" />
    <h3 className="text-2xl font-semibold text-white">Sepetiniz boş gözüküyor</h3>
    <p className="text-gray-400">Görünüşe göre henüz sepetinize bir şey eklememişsiniz.</p>
    <Link
      className="mt-4 rounded-lg bg-emerald-600 px-6 py-3 text-white transition-all duration-300 hover:bg-emerald-700 font-medium"
      to="/"
    >
      Alışverişe Başla
    </Link>
  </motion.div>
);

export default CartPage;