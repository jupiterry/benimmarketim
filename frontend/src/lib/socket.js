import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.DEV 
  ? "http://localhost:5000" 
  : "https://www.devrekbenimmarketim.com";

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

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO Bağlandı:', this.socket.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ Socket.IO Bağlantı Hatası:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ Socket.IO Bağlantısı Kesildi:', reason);
    });

    return this.socket;
  }

  getSocket() {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  // Admin odasına katıl
  joinAdminRoom() {
    const socket = this.getSocket();
    if (socket) {
      socket.emit('joinAdminRoom');
      console.log('🔔 Admin odasına katılındı');
    }
  }

  // Sohbet odasına katıl
  joinChat(chatId) {
    const socket = this.getSocket();
    if (socket && chatId) {
      socket.emit('joinChat', { chatId });
      console.log('💬 Sohbet odasına katılındı:', chatId);
    }
  }

  // Sohbet odasından ayrıl
  leaveChat(chatId) {
    const socket = this.getSocket();
    if (socket && chatId) {
      socket.emit('leaveChat', { chatId });
      console.log('👋 Sohbet odasından ayrılındı:', chatId);
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

