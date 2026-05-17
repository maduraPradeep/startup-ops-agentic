import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const { token, user } = useAuthStore.getState();
    socket = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:3001', {
      auth: { token, tenantId: user?.tenantId },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
