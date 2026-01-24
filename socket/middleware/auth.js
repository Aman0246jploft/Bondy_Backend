const jwt = require("jsonwebtoken");
const User = require("../../db/models/User"); // Adjust path if needed

const socketAuthMiddleware = async (socket, next) => {
  try {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization ||
      socket.handshake.headers?.auth ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    if (token.startsWith("Bearer ")) {
      token = token.split(" ")[1];
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Check if user exists (optional but recommended)
    const user = await User.findById(
      decoded._id || decoded.userId || decoded.id,
    ).select("_id firstName lastName profileImage");

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    // Attach user to socket
    socket.user = user;
    next();
  } catch (err) {
    console.error("Socket Auth Error:", err.message);
    next(new Error("Authentication error: Invalid token"));
  }
};

module.exports = socketAuthMiddleware;
