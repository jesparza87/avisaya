import { Router } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { Response } from "express";

const router = Router();

// GET /api/analytics/history?date=YYYY-MM-DD
router.get("/history", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { date } = req.query;

  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }

  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const start = new Date(date + "T00:00:00.000Z");
  const end = new Date(date + "T23:59:59.999Z");

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
          gte(orders.created_at, start),
          lte(orders.created_at, end)
        )
      );

    const result = rows.map((row) => ({
      id: row.id,
      label: row.label,
      created_at: row.created_at,
      notified_at: row.notified_at,
      wait_seconds:
        row.notified_at != null
          ? Math.round(
              (new Date(row.notified_at).getTime() - new Date(row.created_at).getTime()) / 1000
            )
          : null,
    }));

    return res.json(result);
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
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const todayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );

  try {
    const rows = await db
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
          lte(orders.created_at, todayEnd)
        )
      );

    // total_today: all orders today regardless of status
    const total_today = rows.length;

    // avg_wait_seconds: average wait for orders that have notified_at set
    const withWait = rows
      .filter((r) => r.notified_at != null)
      .map((r) =>
        Math.round(
          (new Date(r.notified_at!).getTime() - new Date(r.created_at).getTime()) / 1000
        )
      );

    const avg_wait_seconds =
      withWait.length > 0
        ? Math.round(withWait.reduce((sum, s) => sum + s, 0) / withWait.length)
        : null;

    // orders_by_hour: last 8 complete hours
    // "complete" means hours that have already finished, i.e. hour < current UTC hour
    const currentUTCHour = now.getUTCHours();

    const last8Hours: { hour: number; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      // go back i+1 hours from current hour to get complete hours
      const h = (currentUTCHour - 1 - i + 24) % 24;
      const label = `${String(h).padStart(2, "0")}:00`;
      last8Hours.push({ hour: h, label });
    }

    const orders_by_hour = last8Hours.map(({ hour, label }) => {
      const count = rows.filter((r) => {
        const d = new Date(r.created_at);
        return d.getUTCHours() === hour;
      }).length;
      return { hour: label, count };
    });

    return res.json({
      total_today,
      avg_wait_seconds,
      orders_by_hour,
    });
  } catch (err) {
    console.error("Error fetching analytics stats:", err);
    return res.status(500).json({ error: "Failed to fetch analytics stats" });
  }
});

export default router;
