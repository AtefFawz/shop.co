let io;

const setIO = (socketIO) => {
  io = socketIO;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }
  return io;
};

const disconnectUserSockets = (userId) => {
  if (!io || !userId) return;
  io.in(`user:${String(userId)}`).disconnectSockets(true);
};

export { setIO, getIO, disconnectUserSockets };
