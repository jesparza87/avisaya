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
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }

  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);

  try {
    const rows = await db
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
          gte(orders.created_at, from),
          lt(orders.created_at, to)
        )
      )
      .orderBy(orders.created_at);

    const result = rows.map((row) => ({
      id: row.id,
      label: row.label,
      created_at: row.created_at,
      notified_at: row.notified_at,
      wait_seconds:
        row.notified_at && row.created_at
          ? Math.round(
              (new Date(row.notified_at).getTime() -
                new Date(row.created_at).getTime()) /
                1000
            )
          : null,
    }));

    return res.json(result);
  } catch (err) {
    console.error("Error fetching history:", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// GET /api/analytics/stats
router.get("/stats", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const todayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );

  try {
    const todayOrders = await db
      .select({
        id: orders.id,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
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

    const withWait = todayOrders.filter((o) => o.notified_at !== null);
    const avg_wait_seconds =
      withWait.length > 0
        ? Math.round(
            withWait.reduce((sum, o) => {
              return (
                sum +
                (new Date(o.notified_at!).getTime() -
                  new Date(o.created_at).getTime()) /
                  1000
              );
            }, 0) / withWait.length
          )
        : null;

    const orders_by_hour: { hour: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourStart.setUTCMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const count = todayOrders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= hourStart.getTime() && t < hourEnd.getTime();
      }).length;

      const label = `${String(hourStart.getUTCHours()).padStart(2, "0")}:00`;
      orders_by_hour.push({ hour: label, count });
    }

    return res.json({ total_today, avg_wait_seconds, orders_by_hour });
  } catch (err) {
    console.error("Error fetching stats:", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
