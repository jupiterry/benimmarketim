import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";
import { useUserStore } from "./useUserStore";

// Bildirim sesi için yeni ses dosyası
const notificationSound = new Audio("/notification.mp3");

// Ses dosyasının yüklendiğinden emin ol
notificationSound.addEventListener('error', (e) => {
  console.error('Ses dosyası yüklenemedi:', e);
});

notificationSound.addEventListener('loadeddata', () => {
  console.log('Ses dosyası başarıyla yüklendi');
});

export const useOrderStore = create((set) => ({
  orders: [],
  loading: false,
  error: null,

  fetchAllOrders: async () => {
    try {
      const res = await axios.get("/orders");
      set({ orders: res.data });
    } catch (error) {
      console.error("Siparişler alınırken hata oluştu", error);
    }
  },

  deleteOrder: async (orderId) => {
    try {
      await axios.delete(`/orders/${orderId}`);
      set((state) => ({
        orders: state.orders.filter((order) => order._id !== orderId),
      }));
    } catch (error) {
      console.error("Sipariş silinirken hata oluştu", error);
    }
  },

  placeOrder: async (orderData) => {
    try {
      const res = await axios.post("/cart/place-order", orderData);
      if (res.data.success) {
        // Sipariş başarılı olduğunda ve ses açıksa çal
        if (useUserStore.getState().soundEnabled) {
          notificationSound.play().catch(err => console.log("Ses çalma hatası:", err));
        }
        toast.success("Sipariş başarıyla oluşturuldu!");
        return res.data;
      }
    } catch (error) {
      console.error("Sipariş oluşturulurken hata oluştu:", error);
      toast.error(error.response?.data?.error || "Sipariş oluşturulurken hata oluştu.");
      throw error;
    }
  },

  createOrder: async (orderData) => {
    try {
      const response = await axios.post("/orders", orderData);
      
      // Sipariş başarılı olduğunda ve ses açıksa çal
      if (response.data.success && useUserStore.getState().soundEnabled) {
        notificationSound.play().catch(err => console.log("Ses çalma hatası:", err));
      }
      
      return response.data;
    } catch (error) {
      console.error("Sipariş oluşturma hatası:", error);
      toast.error("Sipariş oluşturulurken bir hata oluştu");
      throw error;
    }
  },
}));