import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";
import { detectDeviceType } from "../lib/deviceDetection";

export const useUserStore = create(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      checkingAuth: true,
      soundEnabled: true, // Varsayılan olarak ses açık

      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

      signup: async ({ name, email, password, confirmPassword, phone }) => {
        set({ loading: true });

        if (password !== confirmPassword) {
          set({ loading: false });
          return toast.error("Şifreler eşleşmiyor");
        }

        try {
          const deviceType = detectDeviceType();
          console.log("Gönderilen kayıt verileri:", { name, email, password, phone, deviceType });
          const res = await axios.post("/auth/signup", { name, email, password, phone, deviceType });
          console.log("Backend'den dönen yanıt:", res.data);
          
          const userData = { ...res.data, phone };
          set({ user: userData, loading: false });
          toast.success("Kayıt başarılı!");
        } catch (error) {
          console.error("Kayıt hatası:", error.response?.data || error);
          set({ loading: false });
          toast.error(error.response?.data?.message || "Bir hata oluştu");
        }
      },

      login: async (email, password) => {
        set({ loading: true });

        try {
          const deviceType = detectDeviceType();
          const res = await axios.post("/auth/login", { email, password, deviceType });
          set({ user: res.data, loading: false });
          toast.success("Giriş başarılı!");
        } catch (error) {
          set({ loading: false });
          toast.error(error.response.data.message || "Bir hata oluştu");
        }
      },

      logout: async () => {
        try {
          await axios.post("/auth/logout");
          set({ user: null });
          toast.success("Çıkış yapıldı");
        } catch (error) {
          toast.error(error.response?.data?.message || "Çıkış yapılırken bir hata oluştu");
        }
      },

      checkAuth: async () => {
        set({ checkingAuth: true });
        try {
          const response = await axios.get("/auth/profile");
          set({ user: response.data, checkingAuth: false });
        } catch (error) {
          // 401 hatası normal - kullanıcı giriş yapmamış
          if (error.response?.status === 401) {
            console.log("Kullanıcı giriş yapmamış");
          } else {
            console.log(error.message);
          }
          set({ checkingAuth: false, user: null });
        }
      },

      refreshToken: async () => {
        if (get().checkingAuth) return;

        set({ checkingAuth: true });
        try {
          const response = await axios.post("/auth/refresh-token");
          set({ checkingAuth: false });
          return response.data;
        } catch (error) {
          // 401 hatası normal - kullanıcı giriş yapmamış
          if (error.response?.status === 401) {
            console.log("Token yenilenemedi - kullanıcı giriş yapmamış");
          }
          set({ user: null, checkingAuth: false });
          throw error;
        }
      },

      updatePhone: async (phone) => {
        try {
          const response = await axios.put("/auth/update-phone", { phone });
          set((state) => ({
            user: { ...state.user, phone: response.data.phone }
          }));
          toast.success("Telefon numarası güncellendi");
        } catch (error) {
          toast.error(error.response?.data?.message || "Telefon numarası güncellenemedi");
        }
      }
    }),
    {
      name: "user-store", // Local storage'da saklanacak isim
      partialize: (state) => ({ soundEnabled: state.soundEnabled }), // Sadece soundEnabled değerini sakla
    }
  )
);

// Axios interceptor for token refresh
let refreshPromise = null;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // 401 hatası için özel kontrol
    if (error.response?.status === 401) {
      // Eğer kullanıcı zaten giriş yapmamışsa, refresh token deneme
      const currentUser = useUserStore.getState().user;
      if (!currentUser) {
        // Kullanıcı giriş yapmamış, 401 hatası normal
        return Promise.reject(error);
      }
      
      // Kullanıcı giriş yapmış ama token süresi dolmuş, refresh dene
      if (!originalRequest._retry) {
        originalRequest._retry = true;

        try {
          if (refreshPromise) {
            await refreshPromise;
            return axios(originalRequest);
          }

          refreshPromise = useUserStore.getState().refreshToken();
          await refreshPromise;
          refreshPromise = null;

          return axios(originalRequest);
        } catch (refreshError) {
          useUserStore.getState().logout();
          return Promise.reject(refreshError);
        }
      }
    }
    return Promise.reject(error);
  }
);