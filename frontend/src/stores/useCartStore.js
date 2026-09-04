import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

let couponSyncTimer;

const cartPayload = (cart) =>
	(Array.isArray(cart) ? cart : []).map((item) => ({
		product: item._id,
		quantity: item.quantity,
	}));

export const useCartStore = create((set, get) => ({
	cart: [],
	coupon: null,
	total: 0,
	subtotal: 0,
	isCouponApplied: false,
	bestCoupon: null,
	eligibleCoupons: [],
	isCouponSyncing: false,

	getMyCoupon: async () => {
		try {
			const response = await axios.get("/coupons");
			set({ coupon: response.data });
		} catch (error) {
			console.error("Kupon getirilirken hata:", error);
		}
	},
	applyCoupon: async (code, deliveryPoint) => {
		try {
			const { subtotal, cart } = get();
			const response = await axios.post("/coupons/validate", {
				code,
				orderAmount: subtotal,
				products: cartPayload(cart),
				deliveryPoint,
				channel: "web",
			});
			// API returns { success: true, coupon: { code, discountType, discountPercentage, ... } }
			const couponData = response.data.coupon || response.data;
			set({ coupon: couponData, isCouponApplied: true });
			get().calculateTotals();
			toast.success("Kupon başarıyla uygulandı");
		} catch (error) {
			toast.error(error.response?.data?.message || "Kupon uygulanırken bir hata oluştu");
		}
	},
	syncCoupons: async (deliveryPoint, { silent = true } = {}) => {
		const { cart, subtotal, coupon, isCouponApplied } = get();
		if (!cart.length) {
			set({ bestCoupon: null, eligibleCoupons: [] });
			return;
		}
		set({ isCouponSyncing: true });
		try {
			const payload = {
				orderAmount: subtotal,
				products: cartPayload(cart),
				deliveryPoint,
				channel: "web",
			};
			if (isCouponApplied && coupon?.code) {
				const { data } = await axios.post("/coupons/validate", { ...payload, code: coupon.code });
				set({ coupon: data.coupon });
				get().calculateTotals();
			} else {
				const { data } = await axios.post("/coupons/recommend", payload);
				set({ bestCoupon: data.bestCoupon || null, eligibleCoupons: data.eligibleCoupons || [] });
			}
		} catch (error) {
			if (isCouponApplied) {
				set({ coupon: null, isCouponApplied: false });
				get().calculateTotals();
				if (!silent) toast.error(error.response?.data?.message || "Kupon artık sepetiniz için geçerli değil");
			}
		} finally {
			set({ isCouponSyncing: false });
		}
	},
	scheduleCouponSync: (deliveryPoint) => {
		clearTimeout(couponSyncTimer);
		couponSyncTimer = setTimeout(() => get().syncCoupons(deliveryPoint), 350);
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
			get().scheduleCouponSync();
		} catch (error) {
			set({ cart: [] });
			if (error.response?.status === 401) {
				return;
			}
			toast.error(error.response?.data?.message || "Bir hata oluştu");
		}
	},
	clearCart: async () => {
		set({ cart: [], coupon: null, total: 0, subtotal: 0, bestCoupon: null, eligibleCoupons: [], isCouponApplied: false });
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
			get().scheduleCouponSync();
			return Promise.resolve();
		} catch (error) {
			const errorMessage = error.response?.data?.error || error.response?.data?.message || "Lütfen saati kontrol ediniz.";
			toast.error(errorMessage);
			return Promise.reject(error);
		}
	},
	removeFromCart: async (productId) => {
		await axios.delete(`/cart/${productId}`);
		set((prevState) => {
			const currentCart = Array.isArray(prevState.cart) ? prevState.cart : [];
			return { cart: currentCart.filter((item) => item._id !== productId) };
		});
		get().calculateTotals();
		get().scheduleCouponSync();
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
		get().scheduleCouponSync();
	},
	calculateTotals: () => {
		const { cart, coupon } = get();
		const currentCart = Array.isArray(cart) ? cart : [];
		const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
		let total = subtotal;

		if (coupon) {
			let discount = 0;
			if (coupon.calculatedDiscount !== undefined && coupon.calculatedDiscount !== null) {
				discount = Number(coupon.calculatedDiscount) || 0;
				total = Math.max(0, subtotal - discount);
				set({ subtotal, total });
				return;
			}
			
			// API'den gelen kupon yapısını kontrol et
			const discountType = coupon.discountType || 'percentage';
			const discountPercentage = coupon.discountPercentage || 0;
			const discountAmount = coupon.calculatedDiscount ?? coupon.discountAmount ?? 0;
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
