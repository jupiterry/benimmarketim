import { create } from "zustand";
import axios from "../lib/axios";

export const useSettingsStore = create((set) => ({
  settings: {
    orderStartHour: 10,
    orderStartMinute: 0,
    orderEndHour: 1,
    orderEndMinute: 0,
    minimumOrderAmount: 250,
    deliveryPoints: {
      girlsDorm: {
        name: "Kız KYK Yurdu",
        enabled: true,
        startHour: 10,
        startMinute: 0,
        endHour: 1,
        endMinute: 0
      },
      boysDorm: {
        name: "Erkek KYK Yurdu",
        enabled: true,
        startHour: 10,
        startMinute: 0,
        endHour: 1,
        endMinute: 0
      }
    }
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
        minimumOrderAmount: 250,
        deliveryPoints: {
          girlsDorm: {
            name: "Kız KYK Yurdu",
            enabled: true,
            startHour: 10,
            startMinute: 0,
            endHour: 1,
            endMinute: 0
          },
          boysDorm: {
            name: "Erkek KYK Yurdu",
            enabled: true,
            startHour: 10,
            startMinute: 0,
            endHour: 1,
            endMinute: 0
          }
        }
      };
      
      // Deep merge delivery points
      const mergedDeliveryPoints = {
        girlsDorm: {
          ...defaultSettings.deliveryPoints.girlsDorm,
          ...(res.data.deliveryPoints?.girlsDorm || {})
        },
        boysDorm: {
          ...defaultSettings.deliveryPoints.boysDorm,
          ...(res.data.deliveryPoints?.boysDorm || {})
        }
      };

      set({ 
        settings: {
          ...defaultSettings,
          ...res.data,
          deliveryPoints: mergedDeliveryPoints
        },
        loading: false 
      });
      
      return res.data;
    } catch (error) {
      console.error("Error fetching settings:", error);
      set({ loading: false });
      return null;
    }
  }
}));
