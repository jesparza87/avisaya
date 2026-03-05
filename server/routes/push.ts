import { Router, Response } from "express";
import { db } from "../db";
import { push_subscriptions, orders } from "../schema";
import { eq, and } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/push/subscribe
// No auth required — customer subscribes using their order token.
// Ownership is scoped to orderId: only subscriptions tied to a known order are stored.
router.post("/subscribe", async (req: AuthRequest, res: Response) => {
  const { subscription, orderId } = req.body;

  if (!subscription || !orderId) {
    return res.status(400).json({ error: "subscription and orderId are required" });
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription object" });
  }

  try {
    // Verify the order exists before storing a subscription for it
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Upsert: if the same endpoint+orderId already exists, update keys; otherwise insert
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
// Requires authentication — ownership enforced by verifying the order belongs
// to the authenticated user's venue, since push_subscriptions has no user_id column.
router.delete("/subscribe", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { endpoint, orderId } = req.body;

  if (!endpoint || !orderId) {
    return res.status(400).json({ error: "endpoint and orderId are required" });
  }

  try {
    // Verify the order belongs to the authenticated user's venue (ownership check)
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.venue_id, req.user!.venue_id!)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(403).json({ error: "Forbidden: order does not belong to your venue" });
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
