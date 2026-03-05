import { Router } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { eq, and, desc, ne } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { Response } from "express";

const router = Router();

// POST /api/orders — create order (authenticated)
router.post("/", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { label } = req.body;

  if (!label || typeof label !== "string" || label.trim() === "") {
    return res.status(400).json({ error: "label is required" });
  }

  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const [order] = await db
      .insert(orders)
      .values({
        venue_id,
        label: label.trim(),
        status: "waiting",
      })
      .returning();

    return res.status(201).json(order);
  } catch (err) {
    console.error("Error creating order:", err);
    return res.status(500).json({ error: "Failed to create order" });
  }
});

// GET /api/orders — list orders for venue (authenticated)
router.get("/", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const result = await db
      .select()
      .from(orders)
      .where(eq(orders.venue_id, venue_id))
      .orderBy(desc(orders.created_at))
      .limit(50);

    return res.json(result);
  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// GET /api/orders/token/:token — PUBLIC, get order by token
router.get("/token/:token", async (req, res: Response) => {
  const { token } = req.params;

  try {
    const [order] = await db
      .select({
        id: orders.id,
        label: orders.label,
        status: orders.status,
        created_at: orders.created_at,
        venue_id: orders.venue_id,
      })
      .from(orders)
      .where(eq(orders.token, token))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json(order);
  } catch (err) {
    console.error("Error fetching order by token:", err);
    return res.status(500).json({ error: "Failed to fetch order" });
  }
});

// PATCH /api/orders/:id/ready — mark order as ready (authenticated)
router.patch("/:id/ready", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const venue_id = req.user?.venue_id;

  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const [updated] = await db
      .update(orders)
      .set({
        status: "ready",
        notified_at: new Date(),
      })
      .where(and(eq(orders.id, id), eq(orders.venue_id, venue_id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("Error marking order ready:", err);
    return res.status(500).json({ error: "Failed to update order" });
  }
});

// PATCH /api/orders/:id/collected — mark order as collected (authenticated)
router.patch("/:id/collected", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const venue_id = req.user?.venue_id;

  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const [updated] = await db
      .update(orders)
      .set({ status: "collected" })
      .where(and(eq(orders.id, id), eq(orders.venue_id, venue_id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("Error marking order collected:", err);
    return res.status(500).json({ error: "Failed to update order" });
  }
});

// DELETE /api/orders/:id — delete order if status != 'ready' (authenticated)
router.delete("/:id", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const venue_id = req.user?.venue_id;

  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    // Check order exists and is not 'ready'
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.venue_id, venue_id)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (existing.status === "ready") {
      return res.status(400).json({ error: "Cannot delete an order with status 'ready'" });
    }

    await db
      .delete(orders)
      .where(and(eq(orders.id, id), eq(orders.venue_id, venue_id)));

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting order:", err);
    return res.status(500).json({ error: "Failed to delete order" });
  }
});

export default router;
