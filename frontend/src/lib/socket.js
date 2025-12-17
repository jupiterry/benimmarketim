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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

const socketService = new SocketService();
export default socketService;
