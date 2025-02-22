import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

export const useOrderStore = create((set) => ({
  orders: [],

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
        toast.success("Sipariş başarıyla oluşturuldu!");
        return res.data;
      }
    } catch (error) {
      console.error("Sipariş oluşturulurken hata oluştu:", error);
      toast.error(error.response?.data?.error || "Sipariş oluşturulurken hata oluştu.");
      throw error;
    }
  },
}));