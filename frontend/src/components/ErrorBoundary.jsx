import { Component } from "react";

// Uygulama genelinde yakalanmayan çizim hatalarını (tembel yüklenen parçaların
// indirilememesi dahil) boş beyaz ekran yerine kısa bir Türkçe mesajla gösterir.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Beklenmeyen uygulama hatası:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 px-5 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl shadow-black/20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-400">Benim Marketim</p>
          <h1 className="mt-3 text-2xl font-bold">Bir şeyler ters gitti</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Sayfa yüklenirken beklenmeyen bir hata oluştu. Sayfayı yenilemek genellikle sorunu çözer.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Sayfayı yenile
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
