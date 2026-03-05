import { Router, Response } from "express";
import { db } from "../db";
import { orders } from "../../shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// All analytics routes require authentication
router.use(authMiddleware);

/**
 * Returns the UTC offset in milliseconds for a given IANA timezone at a
 * specific UTC instant, using Intl.DateTimeFormat.formatToParts.
 *
 * This avoids the fragile toLocaleString → new Date() parsing approach that
 * is implementation-defined and unreliable across environments.
 */
export function getUtcOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing date part: ${type}`);
    return parseInt(part.value, 10);
  };

  // Reconstruct the local wall-clock time as a UTC timestamp (treating the
  // local time fields as if they were UTC). The difference between this and
  // the actual UTC timestamp gives the offset.
  const localAsUtcMs = Date.UTC(
    get("year"),
    get("month") - 1, // month is 1-based from formatToParts
    get("day"),
    get("hour") === 24 ? 0 : get("hour"), // handle midnight edge case
    get("minute"),
    get("second")
  );

  return localAsUtcMs - date.getTime();
}

/**
 * Converts a UTC Date to the start of the day (00:00:00.000) in the given
 * timezone, returned as a UTC Date.
 */
export function startOfDayInTz(date: Date, timeZone: string): Date {
  const offsetMs = getUtcOffsetMs(date, timeZone);
  const localMs = date.getTime() + offsetMs;
  const startOfLocalDayMs = localMs - (localMs % 86400000);
  return new Date(startOfLocalDayMs - offsetMs);
}

/**
 * Converts a UTC Date to the end of the day (23:59:59.999) in the given
 * timezone, returned as a UTC Date.
 */
export function endOfDayInTz(date: Date, timeZone: string): Date {
  const start = startOfDayInTz(date, timeZone);
  return new Date(start.getTime() + 86400000 - 1);
}

/**
 * GET /api/analytics/summary
 *
 * Returns order analytics for the authenticated venue.
 *
 * Query params:
 *   - from: ISO date string (inclusive), defaults to 30 days ago
 *   - to:   ISO date string (inclusive), defaults to today
 *   - tz:   IANA timezone string, defaults to "UTC"
 *
 * Response:
 *   {
 *     totalOrders: number,
 *     completedOrders: number,
 *     cancelledOrders: number,
 *     pendingOrders: number,
 *     avgFulfillmentMs: number | null,   // average ms from created_at to completed_at
 *     ordersByDay: { date: string; count: number }[]
 *   }
 */
router.get("/summary", async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.user?.venue_id;
    if (!venueId) {
      return res.status(403).json({ error: "No venue associated with this account" });
    }

    // Parse and validate timezone
    const tz = (req.query.tz as string) || "UTC";
    try {
      // Validate the timezone by attempting to use it
      Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return res.status(400).json({ error: "Invalid timezone" });
    }

    // Parse date range
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom;
    const toDate = toParam ? new Date(toParam) : now;

    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (isNaN(toDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'to' date" });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ error: "'from' must be before or equal to 'to'" });
    }

    // Expand to full days in the requested timezone
    const rangeStart = startOfDayInTz(fromDate, tz);
    const rangeEnd = endOfDayInTz(toDate, tz);

    // Fetch all orders for the venue in the date range
    const venueOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venueId),
          gte(orders.created_at, rangeStart),
          lte(orders.created_at, rangeEnd)
        )
      );

    // Aggregate counts
    let completedOrders = 0;
    let cancelledOrders = 0;
    let pendingOrders = 0;
    let totalFulfillmentMs = 0;
    let fulfilledCount = 0;

    // Build a map of date string → count (in the requested timezone)
    const dayCountMap = new Map<string, number>();

    for (const order of venueOrders) {
      // Count by status
      if (order.status === "completed") {
        completedOrders++;
        // Calculate fulfillment time if we have both timestamps
        if (order.completed_at && order.created_at) {
          const fulfillmentMs =
            new Date(order.completed_at).getTime() -
            new Date(order.created_at).getTime();
          if (fulfillmentMs >= 0) {
            totalFulfillmentMs += fulfillmentMs;
            fulfilledCount++;
          }
        }
      } else if (order.status === "cancelled") {
        cancelledOrders++;
      } else {
        // pending, in_progress, etc.
        pendingOrders++;
      }

      // Bucket by local date in the requested timezone
      const createdAt = new Date(order.created_at);
      const localDateStr = getLocalDateString(createdAt, tz);
      dayCountMap.set(localDateStr, (dayCountMap.get(localDateStr) ?? 0) + 1);
    }

    // Build ordered array of days
    const ordersByDay = Array.from(dayCountMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgFulfillmentMs =
      fulfilledCount > 0 ? Math.round(totalFulfillmentMs / fulfilledCount) : null;

    return res.json({
      totalOrders: venueOrders.length,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      avgFulfillmentMs,
      ordersByDay,
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/analytics/orders-by-status
 *
 * Returns a breakdown of order counts by status for the authenticated venue.
 *
 * Query params:
 *   - from: ISO date string (inclusive), defaults to 30 days ago
 *   - to:   ISO date string (inclusive), defaults to today
 *   - tz:   IANA timezone string, defaults to "UTC"
 *
 * Response:
 *   { status: string; count: number }[]
 */
router.get("/orders-by-status", async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.user?.venue_id;
    if (!venueId) {
      return res.status(403).json({ error: "No venue associated with this account" });
    }

    const tz = (req.query.tz as string) || "UTC";
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return res.status(400).json({ error: "Invalid timezone" });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom;
    const toDate = toParam ? new Date(toParam) : now;

    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (isNaN(toDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'to' date" });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ error: "'from' must be before or equal to 'to'" });
    }

    const rangeStart = startOfDayInTz(fromDate, tz);
    const rangeEnd = endOfDayInTz(toDate, tz);

    const rows = await db
      .select({
        status: orders.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venueId),
          gte(orders.created_at, rangeStart),
          lte(orders.created_at, rangeEnd)
        )
      )
      .groupBy(orders.status);

    return res.json(rows);
  } catch (err) {
    console.error("Analytics orders-by-status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Returns a YYYY-MM-DD string for the given UTC date interpreted in the
 * specified IANA timezone, using Intl.DateTimeFormat.formatToParts.
 */
export function getLocalDateString(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA locale produces YYYY-MM-DD format natively
  return formatter.format(date);
}

export default router;
