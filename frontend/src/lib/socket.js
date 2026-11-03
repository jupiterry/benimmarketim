import io from 'socket.io-client';

// Üretimde sayfa hangi origin'den sunuluyorsa Socket.IO da oraya bağlanır
// (www / www'suz alan adı farkı yüzünden CORS sorunu çıkmaz).
const SOCKET_URL = import.meta.env.DEV
  ? "http://localhost:5000"
  : window.location.origin;

class SocketService {
  constructor() {
    this.socket = null;
    this.lifecycleBound = false;
  }

  connect() {
    if (this.socket) {
      return this.socket;
    }

    // Yeniden bağlanma hiç bırakılmaz: eskiden 5 denemeden (~20 sn) sonra vazgeçiliyor, panel sessizce yeni
    // sipariş uyarısı almaz hâle geliyordu. Denemeler arası bekleme en çok 10 sn'ye çıkar.
    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'], // Kesintisiz bağlantı için websocket zorla
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // Kesinti boyunca her denemede değil, yalnızca ilk hatada yazılır
    let errorLogged = false;
    this.socket.on('connect', () => {
      errorLogged = false;
    });
    this.socket.on('connect_error', (err) => {
      if (errorLogged) return;
      errorLogged = true;
      console.error('Socket.IO bağlantı hatası:', err.message);
    });
    // Sunucunun 'error' olayı (ör. admin odası reddedildi). Her katılımda yeni bir dinleyici eklenmesin diye tektir.
    this.socket.on('error', (err) => {
      console.error('Socket.IO sunucu hatası:', err?.message || err);
    });

    this.bindLifecycle();
    return this.socket;
  }

  // İnternet geri gelince ya da sekme yeniden görünür olunca beklemeden bağlan
  bindLifecycle() {
    if (this.lifecycleBound || typeof window === 'undefined') return;
    this.lifecycleBound = true;
    window.addEventListener('online', () => this.reconnectNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.reconnectNow();
    });
  }

  /**
   * Bağlı değilse hemen yeniden bağlanır: bekleyen geri çekilme (backoff) süresi beklenmez. Bir deneme zaten
   * sürüyorsa dokunmaz. Bağlantı denemesi başlatıldıysa true döner.
   */
  reconnectNow() {
    const socket = this.socket;
    if (!socket || socket.connected) return false;
    if (socket.io?._readyState === 'opening') return false;
    socket.disconnect();
    socket.connect();
    return true;
  }

  getSocket() {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  // Admin odasına katıl — JWT token zorunlu (backend artık rol kontrolü yapıyor)
  joinAdminRoom(token) {
    const socket = this.getSocket();
    if (!socket) return;

    // Token web sayfası yenilendiğinde JS state'inde olmayabilir. Backend,
    // HttpOnly accessToken cookie'sini Socket.IO handshake'inden doğrular.
    // Reddedilirse sunucu 'error' olayı gönderir (connect() içinde tek dinleyici yazar).
    socket.emit('joinAdminRoom', token ? { token } : {});
  }

  // Sohbet odasına katıl
  joinChat(chatId) {
    const socket = this.getSocket();
    if (socket && chatId) {
      socket.emit('joinChat', chatId);
    }
  }

  // Sohbet odasından ayrıl
  leaveChat(chatId) {
    const socket = this.getSocket();
    if (socket && chatId) {
      socket.emit('leaveChat', chatId);
    }
  }

  // Olay dinleyicisi ekle
  on(event, callback) {
    const socket = this.getSocket();
    if (socket) {
      socket.on(event, callback);
    }
  }

  // Olay dinleyicisini kaldır
  off(event, callback) {
    const socket = this.getSocket();
    if (socket) {
      socket.off(event, callback);
    }
  }

  // Olay gönder
  emit(event, data) {
    const socket = this.getSocket();
    if (socket) {
      socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

const socketService = new SocketService();
export default socketService;
