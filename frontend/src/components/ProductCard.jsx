import toast from "react-hot-toast";
import { ShoppingCart } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";

const ProductCard = ({ product }) => {
  const { user } = useUserStore();
  const { addToCart } = useCartStore();

  const handleAddToCart = () => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen sisteme giriş yapın.", { id: "login" });
      return;
    }
    addToCart(product);
  };

  // Ürün ismini 30 karakterle sınırlayan yardımcı fonksiyon
  const truncateText = (text, maxLength = 30) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div className="flex w-full relative flex-col overflow-hidden rounded-lg border border-gray-700 shadow-lg max-w-xs mx-auto">
      <div className="relative mx-3 mt-3 flex h-[200px] overflow-hidden rounded-xl">
        <img
          className="object-contain w-full h-full" // object-cover yerine object-contain kullanıyoruz, böylece tüm resim görünür
          src={product.image}
          alt={product.name}
          loading="lazy" // Performans için lazy loading
        />
        <div className="absolute inset-0 bg-black bg-opacity-20" />
      </div>

      <div className="mt-4 px-5 pb-5">
        <h5
          className="text-xl font-semibold tracking-tight text-white whitespace-nowrap overflow-hidden text-ellipsis"
          title={product.name} // Tam ismi tooltip olarak göster
        >
          {truncateText(product.name)}
        </h5>
        <div className="mt-2 mb-5 flex items-center justify-between">
          <p>
            <span className="text-3xl font-bold text-emerald-400">₺{product.price.toFixed(2)}</span>
          </p>
        </div>
        <button
          className="flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-300 w-full"
          onClick={handleAddToCart}
        >
          <ShoppingCart size={22} className="mr-2" />
          Sepete Ekle
        </button>
      </div>
    </div>
  );
};

export default ProductCard;