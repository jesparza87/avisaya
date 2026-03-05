import { Router, Response } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../middleware/auth";

const router = Router();

/**
 * Returns the start-of-day and end-of-day boundaries for a given date
 * in the specified IANA timezone (defaults to UTC).
 */
function getDayBoundaries(
  date: Date,
  timezone: string
): { start: Date; end: Date } {
  // Format the date in the target timezone to get year/month/day
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);

  // Build midnight in the target timezone by finding the UTC offset
  // We create a date string that represents midnight local time and parse it
  const midnightLocal = new Date(
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`
  );

  // Get the UTC offset for midnight in the target timezone
  const utcOffset = getUtcOffsetMs(midnightLocal, timezone);

  const start = new Date(midnightLocal.getTime() - utcOffset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

/**
 * Returns the UTC offset in milliseconds for a given local date in a timezone.
 * Positive means the timezone is ahead of UTC.
 */
function getUtcOffsetMs(localDate: Date, timezone: string): number {
  // Format the local date as if it were UTC, then compare to what the
  // timezone formatter says the time is
  const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = localDate.toLocaleString("en-US", { timeZone: timezone });
  return new Date(utcStr).getTime() - new Date(tzStr).getTime();
}

/**
 * GET /api/analytics/history
 *
 * Returns per-day counts of 'collected' orders for the past N days.
 *
 * Query params:
 *   days  - number of days to look back (default: 7, max: 90)
 *   tz    - IANA timezone string for day boundaries (default: "UTC")
 *
 * Response: { history: Array<{ date: string; count: number }> }
 */
router.get("/history", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.user!.venue_id;
    if (!venueId) {
      return res.status(403).json({ error: "No venue associated with user" });
    }

    const rawDays = parseInt((req.query.days as string) || "7", 10);
    const days = isNaN(rawDays) || rawDays < 1 ? 7 : Math.min(rawDays, 90);

    const timezone = (req.query.tz as string) || "UTC";

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: "Invalid timezone" });
    }

    const now = new Date();
    const history: Array<{ date: string; count: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const { start, end } = getDayBoundaries(targetDate, timezone);

      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            eq(orders.status, "collected"),
            gte(orders.created_at, start),
            lt(orders.created_at, end)
          )
        );

      // Format the date label in the requested timezone
      const dateLabel = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(targetDate);

      history.push({
        date: dateLabel,
        count: result[0]?.count ?? 0,
      });
    }

    return res.json({ history });
  } catch (err) {
    console.error("Analytics /history error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/analytics/stats
 *
 * Returns summary statistics for today.
 *
 * Query params:
 *   tz - IANA timezone string for day boundaries (default: "UTC")
 *
 * Response:
 * {
 *   total_today: number,        // all orders created today (any status)
 *   collected_today: number,    // orders with status 'collected' today
 *   pending_today: number,      // orders with status 'pending' today
 *   notified_today: number,     // orders with status 'notified' today
 *   avg_wait_seconds: number | null  // avg seconds from created_at to notified_at
 *                                    // for orders notified today; null if no data
 * }
 */
router.get("/stats", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.user!.venue_id;
    if (!venueId) {
      return res.status(403).json({ error: "No venue associated with user" });
    }

    const timezone = (req.query.tz as string) || "UTC";

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: "Invalid timezone" });
    }

    const now = new Date();
    const { start: todayStart, end: todayEnd } = getDayBoundaries(now, timezone);

    // Fetch all orders for today (any status) for this venue
    const todayOrders = await db
      .select({
        status: orders.status,
        created_at: orders.created_at,
        notified_at: orders.notified_at,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venueId),
          gte(orders.created_at, todayStart),
          lt(orders.created_at, todayEnd)
        )
      );

    const total_today = todayOrders.length;
    const collected_today = todayOrders.filter((o) => o.status === "collected").length;
    const pending_today = todayOrders.filter((o) => o.status === "pending").length;
    const notified_today = todayOrders.filter((o) => o.status === "notified").length;

    // avg_wait_seconds: average time from created_at to notified_at
    // for orders that have been notified (notified_at is set) and were created today
    const notifiedWithTimestamps = todayOrders.filter(
      (o) => o.notified_at != null && o.created_at != null
    );

    let avg_wait_seconds: number | null = null;
    if (notifiedWithTimestamps.length > 0) {
      const totalWaitMs = notifiedWithTimestamps.reduce((sum, o) => {
        const waitMs =
          new Date(o.notified_at!).getTime() - new Date(o.created_at).getTime();
        return sum + waitMs;
      }, 0);
      avg_wait_seconds = Math.round(
        totalWaitMs / notifiedWithTimestamps.length / 1000
      );
    }

    return res.json({
      total_today,
      collected_today,
      pending_today,
      notified_today,
      avg_wait_seconds,
    });
  } catch (err) {
    console.error("Analytics /stats error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
