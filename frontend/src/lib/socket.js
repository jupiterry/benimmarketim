import io from 'socket.io-client';

// Üretimde sayfa hangi origin'den sunuluyorsa Socket.IO da oraya bağlanır
// (www / www'suz alan adı farkı yüzünden CORS sorunu çıkmaz).
const SOCKET_URL = import.meta.env.DEV
  ? "http://localhost:5000"
  : window.location.origin;

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect() {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'], // Kesintisiz bağlantı için websocket zorla
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket.IO bağlantı hatası:', err.message);
    });

    return this.socket;
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
    socket.emit('joinAdminRoom', token ? { token } : {});

    // Backend'den gelen hata bildirimi
    socket.once('error', (err) => {
      console.error('Admin odası reddedildi:', err?.message || err);
    });
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

