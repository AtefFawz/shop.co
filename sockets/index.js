// SOCKET CONNECTION

import { ADMIN } from "../utils/role.js";
function socketConnection(io) {
  // io.on("connection", (socket) => {
  console.log(ADMIN);
  // Check is admin
  io.on("connection", (socket) => {
    if (socket.role === ADMIN) {
      socket.join("admin");
    } else {
      socket.join(`user:${socket.userId}`);
    }

    socket.on("disconnect", () => {
      console.log(`User disconnect: ${socket.userId}`);
    });
  });
}
export { socketConnection };
