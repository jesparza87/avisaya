import { Router, Response } from "express";
import { db } from "../db";
import { push_subscriptions } from "../schema";
import { eq, and } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/push/subscribe
// Requires authentication — only the authenticated user can subscribe their own orderId
router.post("/subscribe", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { subscription, orderId } = req.body;

  if (!subscription || !orderId) {
    return res.status(400).json({ error: "subscription and orderId are required" });
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription object" });
  }

  try {
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
      // Update existing subscription keys to avoid duplicates
      await db
        .update(push_subscriptions)
        .set({
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(push_subscriptions.endpoint, subscription.endpoint),
            eq(push_subscriptions.order_id, orderId)
          )
        );
    } else {
      // Insert new subscription
      await db.insert(push_subscriptions).values({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        order_id: orderId,
        user_id: req.user!.id,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return res.status(201).json({ message: "Subscription saved" });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return res.status(500).json({ error: "Failed to save push subscription" });
  }
});

// DELETE /api/push/subscribe
// Requires authentication
router.delete("/subscribe", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { endpoint, orderId } = req.body;

  if (!endpoint || !orderId) {
    return res.status(400).json({ error: "endpoint and orderId are required" });
  }

  try {
    await db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.endpoint, endpoint),
          eq(push_subscriptions.order_id, orderId),
          eq(push_subscriptions.user_id, req.user!.id)
        )
      );

    return res.status(200).json({ message: "Subscription removed" });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

export default router;
