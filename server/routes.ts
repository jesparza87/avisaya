import { Express } from "express";
import billingRoutes from "./routes/billing";

export function registerRoutes(app: Express): void {
  app.use("/api/billing", billingRoutes);
}
