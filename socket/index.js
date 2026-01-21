const { Server } = require("socket.io");
const authMiddleware = require("./middleware/auth");
const { chatSocketController } = require("./controllers/chatSocketController");

const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all for now, adjust for production
            methods: ["GET", "POST"],
        },
    });

    // Middleware
    io.use(authMiddleware);

    // Connection
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);
        // Pass to controller
        chatSocketController(io, socket);
    });

    return io;
};

module.exports = initSocket;
