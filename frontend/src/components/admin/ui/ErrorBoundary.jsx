import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Bir ekranda beklenmeyen hata olursa tüm panel beyaz ekrana düşmesin; yalnızca o bölüm
 * hata kartı gösterir ve yeniden denenebilir. `resetKey` (açık sekme) değişince sıfırlanır.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Panel ekranı hata verdi:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-empty ui-error-boundary" role="alert">
        <AlertTriangle />
        <strong>Bu ekran açılırken bir sorun oluştu</strong>
        <span className="ui-muted">{String(this.state.error?.message || this.state.error).slice(0, 200)}</span>
        <div className="ui-empty-action ui-cluster">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => this.setState({ error: null })}><RefreshCw />Tekrar dene</button>
          <button type="button" className="ui-btn" onClick={() => window.location.reload()}>Sayfayı yenile</button>
        </div>
      </div>
    );
  }
}
