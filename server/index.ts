import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { parse as parseCookies } from "cookie";
import authRoutes from "./routes/auth";
import ordersRoutes from "./routes/orders";
import pushRoutes from "./routes/push";
import analyticsRoutes from "./routes/analytics";
import billingRouter from "./routes/billing";
import { initVapid } from "./lib/webpush";
import { setIo } from "./lib/socket";
import jwt from "jsonwebtoken";

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: STRIPE_SECRET_KEY is not set");
    process.exit(1);
  } else {
    console.warn("WARNING: STRIPE_SECRET_KEY is not set — billing endpoints will not work.");
  }
}

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

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

setIo(io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join:venue", (venueId: string) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      socket.emit("error", { message: "Server misconfiguration: JWT_SECRET not set" });
      return;
    }

    let token: string | undefined =
      (socket.handshake.auth as Record<string, string>)?.token;

    if (!token) {
      const rawCookie = socket.handshake.headers.cookie;
      if (rawCookie) {
        const parsed = parseCookies(rawCookie);
        token = parsed["token"];
      }
    }

    try {
      if (!token) throw new Error("No token");
      jwt.verify(token, secret);
      socket.join(venueId);
    } catch {
      socket.emit("error", { message: "Authentication required to join venue room" });
    }
  });

  socket.on("join:order", (orderToken: string) => {
    socket.join(orderToken);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Mount webhook with raw body BEFORE express.json() so Buffer is available for signature verification
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/billing", billingRouter);

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
