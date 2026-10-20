import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Mail, Phone, Save, Trash2, User } from "lucide-react";
import toast from "react-hot-toast";
import { PHONE_PATTERN, useUserStore } from "../stores/useUserStore";

const MAX_AVATAR_SIZE = 512;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Seçilen görseli tarayıcıda en fazla 512px'e küçültüp JPEG data URL'e çevirir.
const resizeImageToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_AVATAR_SIZE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas desteklenmiyor"));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel okunamadı"));
    };
    image.src = objectUrl;
  });

const getInitials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase("tr-TR"))
    .join("") || "?";

const ProfilePage = () => {
  const { user, updatePhone, updateProfilePhoto, removeProfilePhoto } = useUserStore();
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setPhone(user?.phone || "");
  }, [user?.phone]);

  const normalizedPhone = phone.replace(/\s+/g, "");
  const phoneValid = PHONE_PATTERN.test(normalizedPhone);
  const phoneChanged = normalizedPhone !== (user?.phone || "");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!phoneValid) {
      toast.error("Telefon numarası 05XXXXXXXXX biçiminde olmalıdır");
      return;
    }
    setSaving(true);
    try {
      await updatePhone(normalizedPhone);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Görsel en fazla 5 MB olabilir");
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateProfilePhoto(dataUrl);
    } catch (error) {
      toast.error(error.message || "Görsel işlenemedi");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoBusy(true);
    try {
      await removeProfilePhoto();
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_35%),#0a0f17] px-5 pb-16 pt-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-400">Hesabım</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Profil bilgilerin</h1>
          <p className="mt-3 text-gray-400">Üyelik bilgilerini görüntüleyebilir, profil fotoğrafını ve telefon numaranı güncelleyebilirsin.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-emerald-500/30 bg-emerald-500/15 shadow-lg shadow-black/30">
              {user?.avatar ? (
                <img src={user.avatar} alt={user?.name || "Profil fotoğrafı"} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-emerald-300">
                  {getInitials(user?.name)}
                </span>
              )}
            </div>
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <p className="text-sm font-medium text-gray-300">Profil fotoğrafı</p>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" /> {photoBusy ? "Yükleniyor..." : user?.avatar ? "Değiştir" : "Fotoğraf yükle"}
                </button>
                {user?.avatar && (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={handlePhotoRemove}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-red-500/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Kaldır
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500">JPG, PNG veya WebP; en fazla 5 MB. Görsel en fazla 512 piksele küçültülür.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400"><User className="h-4 w-4" /> Ad Soyad</div>
              <p className="mt-2 font-semibold text-white">{user?.name || "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400"><Mail className="h-4 w-4" /> E-posta</div>
              <p className="mt-2 break-all font-semibold text-white">{user?.email || "-"}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6" noValidate>
            <label htmlFor="profile-phone" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
              <Phone className="h-4 w-4 text-emerald-400" /> Telefon numarası
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                pattern="05[0-9]{9}"
                maxLength={11}
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, "").slice(0, 11))}
                placeholder="05XXXXXXXXX"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="submit"
                disabled={saving || !phoneChanged || !phoneValid}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
            {phone && !phoneValid && (
              <p className="mt-2 text-xs text-red-300">Telefon numarası 05 ile başlamalı ve 11 haneli olmalıdır.</p>
            )}
          </form>

          <div className="mt-7 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
            Alışveriş, sepet ve sipariş işlemlerine Benim Marketim mobil uygulamasından devam edebilirsiniz.
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5 text-sm text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Hesabını ve verilerini kalıcı olarak silmek ister misin?</span>
            <Link to="/hesap-silme" className="inline-flex items-center gap-2 font-semibold text-red-300 transition hover:text-red-200">
              <Trash2 className="h-4 w-4" /> Hesabımı sil
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ProfilePage;
