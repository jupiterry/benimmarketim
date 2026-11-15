import { create } from "zustand";
import toast from "react-hot-toast";
import axios from "../lib/axios";

export const useProductStore = create((set) => ({
    products: [],
    loading: false,

    setProducts: (products) => set({ products }),

    // Ürün oluşturma
    createProduct: async (productData) => {
        set({ loading: true });
        try {
            const res = await axios.post("/products", productData);
            set((prevState) => ({
                products: [...prevState.products, res.data],
                loading: false,
            }));
            toast.success("Ürün başarıyla oluşturuldu");
        } catch (error) {
            toast.error(error.response?.data?.error || "Ürün oluşturulamadı");
            set({ loading: false });
        }
    },

    // Tüm ürünleri getir
    fetchAllProducts: async () => {
        set({ loading: true });
        try {
            const response = await axios.get("/products");
            set({ products: response.data.products, loading: false });
        } catch (error) {
            set({ error: "Ürünleri getirirken hata oluştu", loading: false });
            toast.error(error.response?.data?.error || "Ürünleri getirme başarısız");
        }
    },

    // Ürün fiyatını güncelle (0 ya da boş fiyat kaydedilmez; sunucu indirimi kaldırdıysa o da yazılır)
    updateProductPrice: async (productId, newPrice) => {
        const priceNumber = typeof newPrice === "number" ? newPrice : Number(String(newPrice ?? "").trim().replace(",", "."));
        if (String(newPrice ?? "").trim() === "" || !Number.isFinite(priceNumber) || priceNumber <= 0) {
            throw new Error("Geçerli bir fiyat girin (0'dan büyük)");
        }
        set({ loading: true });
        try {
            const response = await axios.put(`/products/update-price/${productId}`, { price: priceNumber });
            const updated = response.data.product;
            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId
                        ? { ...product, price: updated.price, isDiscounted: Boolean(updated.isDiscounted), discountedPrice: updated.discountedPrice ?? null }
                        : product
                ),
                loading: false,
            }));

            return updated; // Güncellenmiş ürünü döndür
        } catch (error) {
            set({ loading: false });
            throw error; // Hata'yı yukarı fırlat, çağıran yerde handle edilsin
        }
    },
}));
