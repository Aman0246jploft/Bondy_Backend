const { Server } = require("socket.io");
const authMiddleware = require("./middleware/auth");
const { chatSocketController } = require("./controllers/chatSocketController");
const { notificationSocketController } = require("./controllers/notificationSocketController");
const socketIO = require("./socketIO");

const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all for now, adjust for production
            methods: ["GET", "POST"],
        },
    });

    // Store io instance for global access
    socketIO.setIO(io);

    // Middleware
    io.use(authMiddleware);

    // Connection
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);
        
        // Pass to controllers
        chatSocketController(io, socket);
        notificationSocketController(io, socket);
    });

    return io;
};

module.exports = initSocket;
