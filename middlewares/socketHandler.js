const jwt = require("jsonwebtoken");
const socketHandler = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("NO_TOKEN"));
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_ACCESS_KEY);

    socket.userId = decoded.id;

    next();
  } catch (error) {
    console.log("Socket JWT Error:", error.name);

    if (error.name === "TokenExpiredError") {
      return next(new Error("ACCESS_TOKEN_EXPIRED"));
    }

    return next(new Error("INVALID_TOKEN"));
  }
};
module.exports = { socketHandler };
