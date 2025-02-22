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

    // Toplu ürün oluşturma
    createBulkProducts: async (productsData) => {
        set({ loading: true });
        try {
            const res = await axios.post("/products/bulk", productsData);
            set((prevState) => ({
                products: [...prevState.products, ...res.data],
                loading: false,
            }));
            toast.success("Toplu ürünler başarıyla oluşturuldu");
        } catch (error) {
            toast.error(error.response?.data?.error || "Toplu ürünler oluşturulamadı");
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

    // Kategoriye göre ürünleri getir
    fetchProductsByCategory: async (category) => {
        try {
            const response = await axios.get(`/products?category=${encodeURIComponent(category)}`);

            set({ products: response.data.products || [] });
        } catch (error) {
            console.error("Ürünleri çekerken hata:", error.response?.data?.message || error.message);
            set({ products: [] });
        }
    },

    // Ürünü sil
    deleteProduct: async (productId) => {
        set({ loading: true });
        try {
            await axios.delete(`/products/${productId}`);
            set((prevProducts) => ({
                products: prevProducts.products.filter((product) => product._id !== productId),
                loading: false,
            }));
            toast.success("Ürün başarıyla silindi");
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.error || "Ürün silinemedi");
        }
    },

    // Öne çıkan ürünü güncelle
    toggleFeaturedProduct: async (productId) => {
        set({ loading: true });
        try {
            const response = await axios.patch(`/products/${productId}`);
            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId ? { ...product, isFeatured: response.data.isFeatured } : product
                ),
                loading: false,
            }));
            toast.success("Ürün öne çıkarıldı");
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.error || "Ürün öne çıkarılamadı");
        }
    },

    // Öne çıkan ürünleri getir
    fetchFeaturedProducts: async () => {
        set({ loading: true });
        try {
            const response = await axios.get("/products/featured");
            set({ products: response.data, loading: false });
        } catch (error) {
            set({ error: "Öne çıkan ürünleri getirirken hata oluştu", loading: false });
            console.log("Öne çıkan ürünleri getirirken hata:", error);
        }
    },

    // Ürün fiyatını güncelle
    updateProductPrice: async (productId, newPrice) => {
        set({ loading: true });
        try {
            const response = await axios.put(`/products/update-price/${productId}`, { price: newPrice });

            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId ? { ...product, price: response.data.product.price } : product
                ),
                loading: false,
            }));

            toast.success("Ürün fiyatı başarıyla güncellendi");
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.error || "Fiyat güncellenemedi");
        }
    },
}));