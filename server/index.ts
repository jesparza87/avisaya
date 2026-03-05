import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import { Server } from "socket.io";
import authRoutes from "./routes/auth";
import ordersRoutes from "./routes/orders";
import pushRoutes from "./routes/push";
import { initVapid } from "./lib/webpush";
import { setIo } from "./lib/socket";

dotenv.config();

// Validate VAPID env vars at startup — fail fast rather than silently misconfigure
try {
  initVapid();
} catch (err) {
  console.error("FATAL: VAPID configuration error —", (err as Error).message);
  process.exit(1);
}

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

// Store io instance for use in route handlers
setIo(io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join:venue", (venueOrToken: string) => {
    socket.join(venueOrToken);
    console.log(`Socket ${socket.id} joined room: ${venueOrToken}`);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// Middleware
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/push", pushRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

httpServer.listen(PORT, () => {
  console.log(`🚀 AvisaYa server running on port ${PORT}`);
});

export default app;
