import crypto from "node:crypto";
import SocketTicket from "../models/socketTicketSchema.js";
import User from "../models/authSchema.js";

const hashTicket = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const socketHandler = async (socket, next) => {
  const ticket = socket.handshake.auth?.ticket;
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(ticket)) {
    return next(new Error("NO_TICKET"));
  }

  try {
    // One-time, 60-second tickets prevent the browser from exposing reusable API JWTs.
    const record = await SocketTicket.findOneAndDelete({
      tokenHash: hashTicket(ticket),
      expiresAt: { $gt: new Date() },
    }).select("user tokenVersion");

    if (!record) return next(new Error("INVALID_TICKET"));

    const user = await User.findById(record.user).select("role +tokenVersion");
    if (!user || (user.tokenVersion ?? 0) !== record.tokenVersion) {
      return next(new Error("INVALID_TICKET"));
    }

    socket.userId = user._id.toString();
    socket.role = user.role;
    return next();
  } catch {
    return next(new Error("SOCKET_AUTH_UNAVAILABLE"));
  }
};

export { socketHandler };
