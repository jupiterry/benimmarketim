import { create } from "zustand";
import axios from "../lib/axios";

export const useSettingsStore = create((set, get) => ({
  settings: {
    orderStartHour: 10,
    orderStartMinute: 0,
    orderEndHour: 1,
    orderEndMinute: 0,
    minimumOrderAmount: 250
  },
  loading: false,
  
  fetchSettings: async () => {
    try {
      set({ loading: true });
      const res = await axios.get("/settings");
      
      // Merge with default settings
      const defaultSettings = {
        orderStartHour: 10,
        orderStartMinute: 0,
        orderEndHour: 1,
        orderEndMinute: 0,
        minimumOrderAmount: 250
      };
      
      set({ 
        settings: {
          ...defaultSettings,
          ...res.data
        },
        loading: false 
      });
      
      return res.data;
    } catch (error) {
      console.error("Error fetching settings:", error);
      set({ loading: false });
      return null;
    }
  },
  
  updateSettings: async (newSettings) => {
    try {
      set({ loading: true });
      await axios.put("/settings", newSettings);
      set({ 
        settings: {
          ...get().settings,
          ...newSettings
        },
        loading: false 
      });
      return true;
    } catch (error) {
      console.error("Error updating settings:", error);
      set({ loading: false });
      return false;
    }
  },
  
  // Helper function to get formatted order hours
  getFormattedOrderHours: () => {
    const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute } = get().settings;
    
    const formatTime = (hour, minute) => {
      return `${hour}:${minute.toString().padStart(2, '0')}`;
    };
    
    return {
      start: formatTime(orderStartHour, orderStartMinute),
      end: formatTime(orderEndHour, orderEndMinute),
      isNextDay: orderStartHour > orderEndHour
    };
  },
  
  // Helper to get minimum order amount
  getMinimumOrderAmount: () => {
    return get().settings.minimumOrderAmount;
  }
})); 