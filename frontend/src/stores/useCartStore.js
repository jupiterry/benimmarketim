import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

export const useCartStore = create((set, get) => ({
	cart: [],
	coupon: null,
	total: 0,
	subtotal: 0,
	isCouponApplied: false,

	getMyCoupon: async () => {
		try {
			const response = await axios.get("/coupons");
			set({ coupon: response.data });
		} catch (error) {
			console.error("Kupon getirilirken hata:", error);
		}
	},
	applyCoupon: async (code) => {
		try {
			const { subtotal } = get();
			const response = await axios.post("/coupons/validate", { code, orderAmount: subtotal });
			// API returns { success: true, coupon: { code, discountType, discountPercentage, ... } }
			const couponData = response.data.coupon || response.data;
			set({ coupon: couponData, isCouponApplied: true });
			get().calculateTotals();
			toast.success("Kupon başarıyla uygulandı");
		} catch (error) {
			toast.error(error.response?.data?.message || "Kupon uygulanırken bir hata oluştu");
		}
	},
	removeCoupon: () => {
		set({ coupon: null, isCouponApplied: false });
		get().calculateTotals();
		toast.success("Kupon Kaldırıldı");
	},

	getCartItems: async () => {
		try {
			const res = await axios.get("/cart");
			set({ cart: res.data });
			get().calculateTotals();
		} catch (error) {
			set({ cart: [] });
			if (error.response?.status === 401) {
				return;
			}
			toast.error(error.response?.data?.message || "Bir hata oluştu");
		}
	},
	clearCart: async () => {
		set({ cart: [], coupon: null, total: 0, subtotal: 0 });
		localStorage.removeItem('cart');
	},
	addToCart: async (product) => {
		try {
			await axios.post("/cart", { productId: product._id });

		set((prevState) => {
			// Cart'ın array olduğundan emin ol
			const currentCart = Array.isArray(prevState.cart) ? prevState.cart : [];
			const existingItem = currentCart.find((item) => item._id === product._id);
			const newCart = existingItem
				? currentCart.map((item) =>
						item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
				  )
				: [...currentCart, { ...product, quantity: 1 }];
			return { cart: newCart };
		});
			get().calculateTotals();
			return Promise.resolve();
		} catch (error) {
			const errorMessage = error.response?.data?.error || error.response?.data?.message || "Lütfen saati kontrol ediniz.";
			toast.error(errorMessage);
			return Promise.reject(error);
		}
	},
	removeFromCart: async (productId) => {
		await axios.delete(`/cart`, { data: { productId } });
		set((prevState) => {
			const currentCart = Array.isArray(prevState.cart) ? prevState.cart : [];
			return { cart: currentCart.filter((item) => item._id !== productId) };
		});
		get().calculateTotals();
	},
	updateQuantity: async (productId, quantity) => {
		if (quantity === 0) {
			get().removeFromCart(productId);
			return;
		}

		await axios.put(`/cart/${productId}`, { quantity });
		set((prevState) => {
			const currentCart = Array.isArray(prevState.cart) ? prevState.cart : [];
			return {
				cart: currentCart.map((item) => (item._id === productId ? { ...item, quantity } : item)),
			};
		});
		get().calculateTotals();
	},
	calculateTotals: () => {
		const { cart, coupon } = get();
		const currentCart = Array.isArray(cart) ? cart : [];
		const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
		let total = subtotal;

		if (coupon) {
			let discount = 0;
			
			// API'den gelen kupon yapısını kontrol et
			const discountType = coupon.discountType || 'percentage';
			const discountPercentage = coupon.discountPercentage || 0;
			const discountAmount = coupon.discountAmount || coupon.calculatedDiscount || 0;
			const maximumDiscount = coupon.maximumDiscount;
			
			if (discountType === 'percentage' && discountPercentage > 0) {
				discount = subtotal * (discountPercentage / 100);
				// Maksimum indirim kontrolü
				if (maximumDiscount && discount > maximumDiscount) {
					discount = maximumDiscount;
				}
			} else if (discountType === 'fixed' && discountAmount > 0) {
				discount = discountAmount;
			} else if (discountPercentage > 0) {
				// Eski format desteği
				discount = subtotal * (discountPercentage / 100);
			}
			
			total = subtotal - discount;
			
			// Total negatif olamaz
			if (total < 0) total = 0;
		}

		set({ subtotal, total });
	},
}));