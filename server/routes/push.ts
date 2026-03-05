import { Router, Request, Response } from "express";
import { db } from "../db";
import { push_subscriptions, orders } from "../schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/push/vapid-key
router.get("/vapid-key", (_req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: "VAPID_PUBLIC_KEY not configured" });
  }
  return res.json({ publicKey });
});

// POST /api/push/subscribe
router.post("/subscribe", async (req: Request, res: Response) => {
  const { orderId, subscription } = req.body as {
    orderId: string;
    subscription: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    };
  };

  if (!orderId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Verify the order exists
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order.length) {
    return res.status(404).json({ error: "Order not found" });
  }

  await db.insert(push_subscriptions).values({
    order_id: orderId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
  });

  return res.status(201).json({ ok: true });
});

export default router;
