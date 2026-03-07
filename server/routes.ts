import { Express } from "express";
import express from "express";
import authRoutes from "./routes/auth";
import ordersRoutes from "./routes/orders";
import pushRoutes from "./routes/push";
import analyticsRoutes from "./routes/analytics";
import billingRouter from "./routes/billing";

export function registerRoutes(app: Express): void {
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/push", pushRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/billing", billingRouter);
}
