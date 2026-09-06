import { useEffect, useState } from "react";
import { Mail, Phone, Save, User } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";

const ProfilePage = () => {
  const { user, updatePhone } = useUserStore();
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(user?.phone || "");
  }, [user?.phone]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updatePhone(phone);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_35%),#0a0f17] px-5 pb-16 pt-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-400">Hesabım</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Profil bilgilerin</h1>
          <p className="mt-3 text-gray-400">Üyelik bilgilerini görüntüleyebilir ve telefon numaranı güncelleyebilirsin.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
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

          <form onSubmit={handleSubmit} className="mt-6">
            <label htmlFor="profile-phone" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
              <Phone className="h-4 w-4 text-emerald-400" /> Telefon numarası
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="05XX XXX XX XX"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="submit"
                disabled={saving || phone === (user?.phone || "")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>

          <div className="mt-7 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
            Alışveriş, sepet ve sipariş işlemlerine Benim Marketim mobil uygulamasından devam edebilirsiniz.
          </div>
        </div>
      </div>
    </main>
  );
};

export default ProfilePage;
