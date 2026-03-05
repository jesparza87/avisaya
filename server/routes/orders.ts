import { Router } from "express";
import { db } from "../db";
import { orders } from "../schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { Response } from "express";
import { getIo } from "../lib/socket";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string and return the start-of-day and end-of-day
 * Date objects in the given IANA timezone (e.g. "Europe/Madrid").
 *
 * Returns null if the date string is invalid (fails regex OR produces an
 * invalid calendar date such as 2024-13-45).
 */
export function parseDayBoundsInTimezone(
  dateStr: string,
  timezone: string
): { start: Date; end: Date } | null {
  // 1. Basic format check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // 2. Validate calendar ranges before doing any Date math
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  /**
   * Convert a naive "wall clock" datetime (expressed as individual parts)
   * in the given IANA timezone to a UTC Date.
   *
   * Strategy: guess the UTC instant assuming the offset equals the one
   * observed at that guess, then verify the round-trip and correct for DST
   * gaps/overlaps.
   */
  function localWallToUtc(
    y: number,
    mo: number,
    d: number,
    h: number,
    mi: number,
    s: number,
    ms: number,
    tz: string
  ): Date | null {
    // Initial guess: treat the wall time as if it were UTC
    const guessUtc = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    function getPartsMap(date: Date): Record<string, number> {
      const parts = formatter.formatToParts(date);
      const map: Record<string, number> = {};
      for (const part of parts) {
        if (part.type !== "literal") {
          map[part.type] = Number(part.value);
        }
      }
      return map;
    }

    // Find the offset: what wall-clock time does our guessed UTC correspond to?
    const observed = getPartsMap(guessUtc);
    const observedUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour === 24 ? 0 : observed.hour,
      observed.minute,
      observed.second
    );
    const wantedUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    const offsetMs = observedUtc - wantedUtc;

    const candidate = new Date(guessUtc.getTime() - offsetMs);

    // Verify the candidate round-trips to the correct wall-clock date
    const verify = getPartsMap(candidate);
    if (verify.year !== y || verify.month !== mo || verify.day !== d) {
      // DST spring-forward gap: nudge forward one hour and re-verify
      const adjusted = new Date(candidate.getTime() + 3_600_000);
      const verify2 = getPartsMap(adjusted);
      if (verify2.year !== y || verify2.month !== mo || verify2.day !== d) {
        return null; // Cannot resolve — truly invalid date in this timezone
      }
      return adjusted;
    }

    return candidate;
  }

  const start = localWallToUtc(year, month, day, 0, 0, 0, 0, timezone);
  const end = localWallToUtc(year, month, day, 23, 59, 59, 999, timezone);

  if (!start || !end) return null;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return { start, end };
}

// ---------------------------------------------------------------------------
// POST /api/orders — create order (authenticated)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/orders — list orders for venue (authenticated)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/orders/stats — daily stats for venue (authenticated)
//
// Query params:
//   date     YYYY-MM-DD  (required) — the day to aggregate
//   timezone string      (optional, default "UTC") — IANA timezone name
//
// Response:
//   {
//     date: string,
//     timezone: string,
//     total_orders: number,
//     completed_orders: number,      // status = 'collected'
//     avg_wait_seconds: number|null, // created_at → collected_at (full customer wait)
//     avg_notify_seconds: number|null// created_at → notified_at  (time to notify)
//   }
//
// NOTE: /stats must be declared BEFORE /token/:token and /:id/* routes so
// Express does not treat "stats" as a token or id value.
// ---------------------------------------------------------------------------
router.get("/stats", verifyJWT, async (req: AuthRequest, res: Response) => {
  const venue_id = req.user?.venue_id;
  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  const dateParam = req.query.date as string | undefined;
  const timezoneParam = (req.query.timezone as string | undefined) ?? "UTC";

  if (!dateParam) {
    return res
      .status(400)
      .json({ error: "date query parameter is required (YYYY-MM-DD)" });
  }

  // Validate timezone is a recognised IANA name
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezoneParam });
  } catch {
    return res.status(400).json({ error: `Invalid timezone: ${timezoneParam}` });
  }

  const bounds = parseDayBoundsInTimezone(dateParam, timezoneParam);
  if (!bounds) {
    return res.status(400).json({
      error: `Invalid date: "${dateParam}". Must be a real calendar date in YYYY-MM-DD format.`,
    });
  }

  const { start, end } = bounds;

  try {
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venue_id),
          gte(orders.created_at, start),
          lte(orders.created_at, end)
        )
      );

    const totalOrders = rows.length;
    const collectedRows = rows.filter((r) => r.status === "collected");

    // avg_wait_seconds: created_at → collected_at
    // Represents the full time a customer waited from placing the order to
    // collecting it. Only meaningful for orders that have been collected.
    const collectedWithBothTimes = collectedRows.filter(
      (r) => r.collected_at != null && r.created_at != null
    );
    const avgWaitSeconds =
      collectedWithBothTimes.length > 0
        ? Math.round(
            collectedWithBothTimes.reduce((sum, r) => {
              return (
                sum +
                (new Date(r.collected_at!).getTime() -
                  new Date(r.created_at!).getTime()) /
                  1000
              );
            }, 0) / collectedWithBothTimes.length
          )
        : null;

    // avg_notify_seconds: created_at → notified_at
    // Represents how long it took staff to mark an order ready (kitchen/bar
    // performance metric). Includes all orders that were ever notified.
    const notifiedWithBothTimes = rows.filter(
      (r) => r.notified_at != null && r.created_at != null
    );
    const avgNotifySeconds =
      notifiedWithBothTimes.length > 0
        ? Math.round(
            notifiedWithBothTimes.reduce((sum, r) => {
              return (
                sum +
                (new Date(r.notified_at!).getTime() -
                  new Date(r.created_at!).getTime()) /
                  1000
              );
            }, 0) / notifiedWithBothTimes.length
          )
        : null;

    return res.json({
      date: dateParam,
      timezone: timezoneParam,
      total_orders: totalOrders,
      completed_orders: collectedRows.length,
      avg_wait_seconds: avgWaitSeconds,
      avg_notify_seconds: avgNotifySeconds,
    });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    return res.status(500).json({ error: "Failed to fetch order stats" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orders/token/:token — PUBLIC, get order by token
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// PATCH /api/orders/:id/ready — mark order as ready (authenticated)
// ---------------------------------------------------------------------------
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
});

// ---------------------------------------------------------------------------
// PATCH /api/orders/:id/collected — mark order as collected (authenticated)
// ---------------------------------------------------------------------------
router.patch("/:id/collected", verifyJWT, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const venue_id = req.user?.venue_id;

  if (!venue_id) {
    return res.status(400).json({ error: "User has no associated venue" });
  }

  try {
    const [updated] = await db
      .update(orders)
      .set({
        status: "collected",
        collected_at: new Date(),
      })
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
});

// ---------------------------------------------------------------------------
// DELETE /api/orders/:id — delete order if status != 'ready' (authenticated)
// ---------------------------------------------------------------------------
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
