import { Router, Response } from "express";
import { db } from "../db";
import { push_subscriptions, orders } from "../schema";
import { eq, and } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/push/subscribe
router.post("/subscribe", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { subscription, orderId } = req.body;

  if (!subscription || !orderId) {
    return res.status(400).json({ error: "subscription and orderId are required" });
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription object" });
  }

  try {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const existing = await db
      .select()
      .from(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.endpoint, subscription.endpoint),
          eq(push_subscriptions.order_id, orderId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(push_subscriptions)
        .set({
          p256dh: subscription.keys.p256dh,
          auth_key: subscription.keys.auth,
        })
        .where(
          and(
            eq(push_subscriptions.endpoint, subscription.endpoint),
            eq(push_subscriptions.order_id, orderId)
          )
        );
    } else {
      await db.insert(push_subscriptions).values({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        order_id: orderId,
      });
    }

    return res.status(201).json({ message: "Subscription saved" });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return res.status(500).json({ error: "Failed to save push subscription" });
  }
});

// DELETE /api/push/subscribe
router.delete("/subscribe", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { endpoint, orderId } = req.body;

  if (!endpoint || !orderId) {
    return res.status(400).json({ error: "endpoint and orderId are required" });
  }

  try {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    await db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.endpoint, endpoint),
          eq(push_subscriptions.order_id, orderId)
        )
      );

    return res.status(200).json({ message: "Subscription removed" });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

export default router;

