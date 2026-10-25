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

    // Ürün fiyatını güncelle
    updateProductPrice: async (productId, newPrice) => {
        set({ loading: true });
        try {
            const priceNumber = parseFloat(newPrice);
            if (isNaN(priceNumber) || priceNumber < 0) {
                set({ loading: false });
                throw new Error("Geçerli bir fiyat giriniz");
            }

            const response = await axios.put(`/products/update-price/${productId}`, { price: priceNumber }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            
            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId ? { ...product, price: response.data.product.price } : product
                ),
                loading: false,
            }));
            
            return response.data.product; // Güncellenmiş ürünü döndür
        } catch (error) {
            set({ loading: false });
            throw error; // Hata'yı yukarı fırlat, çağıran yerde handle edilsin
        }
    },
}));
