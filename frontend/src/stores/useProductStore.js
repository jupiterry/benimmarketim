import { create } from "zustand";
import toast from "react-hot-toast";
import axios from "../lib/axios";

export const useProductStore = create((set) => ({
    products: [],
    loading: false,

    setProducts: (products) => set({ products }),
    reorderProducts: (newProducts) => set({ products: newProducts }),

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
            set((prevProducts) => {
                const currentProducts = Array.isArray(prevProducts.products) ? prevProducts.products : [];
                return {
                    products: currentProducts.filter((product) => product._id !== productId),
                    loading: false,
                };
            });
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
            toast.success(response.data.isFeatured ? "Ürün öne çıkarıldı" : "Ürün öne çıkarılanlardan kaldırıldı");
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.error || "İşlem başarısız oldu");
        }
    },

    // Öne çıkan ürünleri getir
    fetchFeaturedProducts: async () => {
        set({ loading: true });
        try {
            const response = await axios.get("/products/featured");
            
            // Backend'ten gelen response yapısını kontrol et
            let featuredProducts = [];
            
            if (response.data && response.data.success && Array.isArray(response.data.products)) {
                // Yeni format: { success: true, products: [...], count: number }
                featuredProducts = response.data.products;
            } else if (Array.isArray(response.data)) {
                // Eski format: direkt array
                featuredProducts = response.data;
            } else if (response.data && Array.isArray(response.data.products)) {
                // Alternatif format: { products: [...] }
                featuredProducts = response.data.products;
            }
            
            set({ products: featuredProducts, loading: false });
        } catch (error) {
            set({ error: "Öne çıkan ürünleri getirirken hata oluştu", loading: false, products: [] });
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

    // Ürün stok durumunu güncelle
    toggleOutOfStock: async (productId) => {
        set({ loading: true });
        try {
            const response = await axios.patch(`/products/toggle-out-of-stock/${productId}`, {}, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId ? { ...product, isOutOfStock: response.data.product.isOutOfStock } : product
                ),
                loading: false,
            }));

            toast.success(response.data.message);
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.message || "Tükendi durumu değiştirilirken hata oluştu.");
        }
    },

    // Ürün adını güncelle
    updateProductName: async (productId, newName) => {
        set({ loading: true });
        try {
            const response = await axios.put(`/products/update-name/${productId}`, { name: newName });
            set((prevProducts) => ({
                products: prevProducts.products.map((product) =>
                    product._id === productId ? { ...product, name: response.data.product.name } : product
                ),
                loading: false,
            }));
            toast.success("Ürün adı başarıyla güncellendi");
        } catch (error) {
            set({ loading: false });
            toast.error(error.response?.data?.error || "İsim güncellenemedi");
        }
    },

}));