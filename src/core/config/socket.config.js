import { Server } from 'socket.io';

let io;

export const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [process.env.CLIENT_URL_DEV, process.env.CLIENT_URL_DEV_2, process.env.CLIENT_URL_DEV_3, process.env.CLIENT_URL_DEV_4].filter(Boolean),
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};