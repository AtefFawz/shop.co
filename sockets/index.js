// SOCKET CONNECTION

const { ADMIN } = require("../utils/role");
function socketConnection(io) {
  // io.on("connection", (socket) => {
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
module.exports = { socketConnection };
