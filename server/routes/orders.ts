import { Router } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { Response } from "express";
import { getIo } from "../lib/socket";

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

// GET /api/orders/history?date=YYYY-MM-DD — collected orders for a date (authenticated)
router.get("/history", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const { date } = req.query;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res
      .status(400)
      .json({ error: "date query param is required in YYYY-MM-DD format" });
  }

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  try {
    const result = await db
      .select({
        id: orders.id,
        label: orders.label,
        status: orders.status,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          eq(orders.status, "collected"),
          gte(orders.created_at, startOfDay),
          lte(orders.created_at, endOfDay)
        )
      )
      .orderBy(desc(orders.created_at));

    const withWaitTime = result.map((order) => {
      let wait_seconds: number | null = null;
      if (order.notified_at && order.created_at) {
        wait_seconds = Math.round(
          (new Date(order.notified_at).getTime() -
            new Date(order.created_at).getTime()) /
            1000
        );
      }
      return { ...order, wait_seconds };
    });

    return res.json(withWaitTime);
  } catch (err) {
    console.error("Error fetching order history:", err);
    return res.status(500).json({ error: "Failed to fetch order history" });
  }
});

// GET /api/orders/stats — today's stats for venue (authenticated)
router.get("/stats", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
  const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

  try {
    const todayOrders = await db
      .select({
        id: orders.id,
        status: orders.status,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          gte(orders.created_at, startOfToday),
          lte(orders.created_at, endOfToday)
        )
      );

    const total = todayOrders.length;

    // Average wait time: only for orders that have notified_at
    const ordersWithWait = todayOrders.filter((o) => o.notified_at != null);
    let avg_wait_seconds: number | null = null;
    if (ordersWithWait.length > 0) {
      const totalWait = ordersWithWait.reduce((acc, o) => {
        return (
          acc +
          (new Date(o.notified_at!).getTime() -
            new Date(o.created_at).getTime())
        );
      }, 0);
      avg_wait_seconds = Math.round(totalWait / ordersWithWait.length / 1000);
    }

    // Orders per hour for the last 8 hours
    const hoursData: { hour: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000 - 1);

      const count = todayOrders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= hourStart.getTime() && t <= hourEnd.getTime();
      }).length;

      hoursData.push({
        hour: hourStart.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        count,
      });
    }

    return res.json({
      total,
      avg_wait_seconds,
      orders_by_hour: hoursData,
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
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
router.patch(
  "/:id/ready",
  verifyJWT,
  async (req: AuthRequest, res: Response) => {
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

      const io = getIo();
      io.to(venue_id.toString()).emit("order:updated", {
        token: updated.token,
        status: "ready",
        label: updated.label,
        id: updated.id,
      });
      io.to(updated.token).emit("order:updated", {
        token: updated.token,
        status: "ready",
        label: updated.label,
        id: updated.id,
      });

      return res.json(updated);
    } catch (err) {
      console.error("Error marking order ready:", err);
      return res.status(500).json({ error: "Failed to update order" });
    }
  }
);

// PATCH /api/orders/:id/collected — mark order as collected (authenticated)
router.patch(
  "/:id/collected",
  verifyJWT,
  async (req: AuthRequest, res: Response) => {
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

      const io = getIo();
      io.to(venue_id.toString()).emit("order:updated", {
        token: updated.token,
        status: "collected",
        label: updated.label,
        id: updated.id,
      });
      io.to(updated.token).emit("order:updated", {
        token: updated.token,
        status: "collected",
        label: updated.label,
        id: updated.id,
      });

      return res.json(updated);
    } catch (err) {
      console.error("Error marking order collected:", err);
      return res.status(500).json({ error: "Failed to update order" });
    }
  }
);

// DELETE /api/orders/:id — delete order if status != 'ready' (authenticated)
router.delete("/:id", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const venue_id = req.user?.venue_id;

  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.venue_id, venue_id)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (existing.status === "ready") {
      return res
        .status(400)
        .json({ error: "Cannot delete an order with status 'ready'" });
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
