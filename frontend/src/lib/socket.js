import { io } from 'socket.io-client';

const getSocketUrl = () => {
  if (import.meta.env.MODE === 'development') {
    return 'http://localhost:5000';
  }
  // Production'da window.location.origin kullanarak mevcut domain'i al
  return window.location.origin;
};

export const createSocket = () => {
  const socket = io(getSocketUrl(), {
    withCredentials: true,
    transports: ['polling', 'websocket'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 20000,
    forceNew: true
  });

  socket.io.on("error", (error) => {
    console.error('Socket.IO altyapı hatası:', error);
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    console.log('Yeniden bağlanma denemesi:', attempt);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO bağlantı hatası:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket.IO bağlantısı kesildi:', reason);
  });

  return socket;
}; 