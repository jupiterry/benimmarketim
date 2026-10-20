import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";
import { detectDeviceType } from "../lib/deviceDetection";

// Türkiye cep telefonu biçimi: 05XXXXXXXXX
export const PHONE_PATTERN = /^05\d{9}$/;

export const useUserStore = create(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      checkingAuth: true,
      soundEnabled: true, // Varsayılan olarak ses açık

      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

      signup: async ({ name, email, password, confirmPassword, phone, referralCode }) => {
        set({ loading: true });

        if (password !== confirmPassword) {
          set({ loading: false });
          return toast.error("Şifreler eşleşmiyor");
        }

        try {
          const deviceType = detectDeviceType();
          const res = await axios.post("/auth/signup", { name, email, password, phone, deviceType, referralCode });
          
          const userData = { ...res.data, phone };
          set({ user: userData, loading: false });
          
          // Referral kuponu varsa özel mesaj göster
          if (res.data.referralCoupon) {
            toast.success(`Kayıt başarılı! 🎁 Hoş geldin kuponu: ${res.data.referralCoupon}`, { duration: 5000 });
          } else {
            toast.success("Kayıt başarılı!");
          }
        } catch (error) {
          console.error("Kayıt hatası:", error.message);
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
          toast.error(
            error.response?.data?.message ||
            (error.request
              ? "Sunucuya bağlanılamadı. Backend'in çalıştığından emin olun."
              : "Bir hata oluştu")
          );
        }
      },

      logout: async () => {
        try {
          await axios.post("/auth/logout");
          toast.success("Çıkış yapıldı");
        } catch (error) {
          toast.error(error.response?.data?.message || "Çıkış yapılırken bir hata oluştu");
        } finally {
          // API başarısız olsa bile yerel oturum temizlenir
          set({ user: null });
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
        const normalized = String(phone ?? "").replace(/\s+/g, "");
        if (!PHONE_PATTERN.test(normalized)) {
          toast.error("Telefon numarası 05XXXXXXXXX biçiminde olmalıdır");
          return false;
        }
        try {
          const response = await axios.put("/auth/update-phone", { phone: normalized });
          set((state) => ({
            user: { ...state.user, phone: response.data.phone }
          }));
          toast.success("Telefon numarası güncellendi");
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Telefon numarası güncellenemedi");
          return false;
        }
      },

      updateProfilePhoto: async (image) => {
        try {
          const response = await axios.put("/auth/profile-photo", { image });
          set((state) => ({
            user: { ...state.user, avatar: response.data.avatar ?? null }
          }));
          toast.success("Profil fotoğrafı güncellendi");
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Profil fotoğrafı yüklenemedi");
          return false;
        }
      },

      removeProfilePhoto: async () => {
        try {
          await axios.delete("/auth/profile-photo");
          set((state) => ({
            user: { ...state.user, avatar: null }
          }));
          toast.success("Profil fotoğrafı kaldırıldı");
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Profil fotoğrafı kaldırılamadı");
          return false;
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
          if (!refreshPromise) {
            refreshPromise = useUserStore.getState().refreshToken().finally(() => {
              refreshPromise = null;
            });
          }
          await refreshPromise;

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
