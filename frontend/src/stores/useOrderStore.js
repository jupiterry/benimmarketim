import create from "zustand";
import axios from "../lib/axios";

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
}));
