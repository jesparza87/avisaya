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
import analyticsRoutes from "./routes/analytics";
import { initVapid } from "./lib/webpush";
import { setIo } from "./lib/socket";
import jwt from "jsonwebtoken";

dotenv.config();

// Validate VAPID env vars at startup.
// In production, missing VAPID config is fatal — fail fast.
// In development/test, emit a warning and continue so the server can still
// start without push-notification support configured.
const isProduction = process.env.NODE_ENV === "production";
try {
  initVapid();
} catch (err) {
  if (isProduction) {
    console.error("FATAL: VAPID configuration error —", (err as Error).message);
    process.exit(1);
  } else {
    console.warn(
      "WARNING: VAPID configuration missing — push notifications will not work.",
      (err as Error).message
    );
  }
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

  // join:venue: bar dashboard only — requires valid JWT
  socket.on("join:venue", (venueId: string) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      socket.emit("error", { message: "Server misconfiguration: JWT_SECRET not set" });
      return;
    }

    const token =
      (socket.handshake.auth as Record<string, string>)?.token ||
      socket.handshake.headers.cookie?.match(/token=([^;]+)/)?.[1];

    try {
      if (!token) throw new Error("No token");
      jwt.verify(token, secret);
      socket.join(venueId);
    } catch {
      socket.emit("error", { message: "Authentication required to join venue room" });
    }
  });

  // join:order: customer-facing — no auth required
  socket.on("join:order", (orderToken: string) => {
    socket.join(orderToken);
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
app.use("/api/analytics", analyticsRoutes);

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
