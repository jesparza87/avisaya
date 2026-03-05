import { Router, Response } from "express";
import { db } from "../db";
import { push_subscriptions } from "../schema";
import { eq, and } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import webPush from "web-push";

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
          auth_key: subscription.keys.auth,
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
          eq(push_subscriptions.order_id, orderId)
        )
      );

    return res.status(200).json({ message: "Subscription removed" });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

// POST /api/push/test
// Requires authentication — sends a test push notification to all subscriptions of a given orderId
router.post("/test", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const subscriptions = await db
      .select()
      .from(push_subscriptions)
      .where(eq(push_subscriptions.order_id, orderId));

    if (subscriptions.length === 0) {
      return res.status(200).json({ sent: 0, message: "No subscriptions found for this order" });
    }

    const payload = JSON.stringify({
      title: "Notificación de prueba",
      body: "Esta es una notificación de prueba de AvisaYa",
      url: "/",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth_key,
            },
          },
          payload
        )
      )
    );

    // Remove expired/invalid subscriptions (HTTP 410 Gone)
    const removalPromises: Promise<unknown>[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const err = result.reason as { statusCode?: number };
        if (err?.statusCode === 410) {
          const sub = subscriptions[index];
          console.log(`Removing expired push subscription: ${sub.endpoint}`);
          removalPromises.push(
            db
              .delete(push_subscriptions)
              .where(
                and(
                  eq(push_subscriptions.endpoint, sub.endpoint),
                  eq(push_subscriptions.order_id, orderId)
                )
              )
          );
        } else {
          console.error("Error sending test push notification:", result.reason);
        }
      }
    });

    if (removalPromises.length > 0) {
      await Promise.allSettled(removalPromises);
    }

    const sentCount = results.filter((r) => r.status === "fulfilled").length;

    return res.status(200).json({
      sent: sentCount,
      total: subscriptions.length,
      message: `Test notification sent to ${sentCount} of ${subscriptions.length} subscriptions`,
    });
  } catch (error) {
    console.error("Error sending test push notification:", error);
    return res.status(500).json({ error: "Failed to send test push notification" });
  }
});

export default router;
