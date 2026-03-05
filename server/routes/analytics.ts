import { Router } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { Response } from "express";

const router = Router();

// GET /api/analytics/history?date=YYYY-MM-DD
router.get("/history", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const { date } = req.query;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date query param is required in YYYY-MM-DD format" });
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  try {
    const result = await db
      .select({
        id: orders.id,
        label: orders.label,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          eq(orders.status, "collected"),
          gte(orders.created_at, dayStart),
          lt(orders.created_at, dayEnd)
        )
      )
      .orderBy(orders.created_at);

    const mapped = result.map((o) => ({
      id: o.id,
      label: o.label,
      created_at: o.created_at,
      notified_at: o.notified_at,
      wait_seconds:
        o.notified_at && o.created_at
          ? Math.round(
              (new Date(o.notified_at).getTime() - new Date(o.created_at).getTime()) / 1000
            )
          : null,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Error fetching order history:", err);
    return res.status(500).json({ error: "Failed to fetch order history" });
  }
});

// GET /api/analytics/stats
router.get("/stats", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // total_today: all orders created today for this venue
    const todayOrders = await db
      .select({
        id: orders.id,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
        status: orders.status,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          gte(orders.created_at, todayStart),
          lt(orders.created_at, todayEnd)
        )
      );

    const total_today = todayOrders.length;

    // avg_wait_seconds: only orders with notified_at not null
    const withWait = todayOrders.filter((o) => o.notified_at !== null);
    const avg_wait_seconds =
      withWait.length > 0
        ? Math.round(
            withWait.reduce((sum, o) => {
              return (
                sum +
                (new Date(o.notified_at!).getTime() - new Date(o.created_at!).getTime()) / 1000
              );
            }, 0) / withWait.length
          )
        : null;

    // orders_by_hour: last 8 hours
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000);

    const recentOrders = await db
      .select({ created_at: orders.created_at })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          gte(orders.created_at, eightHoursAgo)
        )
      );

    // Build ordered list of the last 8 hours (may wrap around midnight)
    const hours: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const h = new Date(now.getTime() - i * 60 * 60 * 1000);
      hours.push(h.getHours());
    }

    const countByHour: Record<number, number> = {};
    hours.forEach((h) => (countByHour[h] = 0));

    recentOrders.forEach((o) => {
      const h = new Date(o.created_at!).getHours();
      if (h in countByHour) {
        countByHour[h]++;
      }
    });

    const orders_by_hour = hours.map((h) => ({ hour: h, count: countByHour[h] }));

    return res.json({ total_today, avg_wait_seconds, orders_by_hour });
  } catch (err) {
    console.error("Error fetching analytics stats:", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
