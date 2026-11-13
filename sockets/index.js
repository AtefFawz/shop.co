import { ADMIN, MANAGER } from "../utils/role.js";

const socketConnection = (io) => {
  io.on("connection", (socket) => {
    // Every account gets a private room so logout, password reset, and role
    // changes can revoke active sockets (including administrators).
    socket.join(`user:${socket.userId}`);
    if (socket.role === ADMIN || socket.role === MANAGER) socket.join("admin");
  });
};

export { socketConnection };
