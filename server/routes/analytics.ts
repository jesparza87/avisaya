import { Router, Request, Response } from "express";
import { db } from "../db";
import { orders } from "../../shared/schema";
import { and, eq, gte, lte, sql, count } from "drizzle-orm";
import { authenticate } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// Timezone utility functions
// ---------------------------------------------------------------------------

/**
 * Returns the UTC offset in milliseconds for a given IANA timezone at a
 * specific UTC instant.
 *
 * Implementation note: we ask Intl.DateTimeFormat to format the UTC instant
 * in the target timezone, then reconstruct a "local" epoch from those parts
 * and subtract the original UTC epoch.  This correctly handles DST transitions
 * because Intl always returns the wall-clock time that is actually in effect
 * at that instant.
 *
 * Edge-case: some environments (notably V8 before Node 18) may return
 * hour=24 for the very first instant of a new day.  We normalise that to
 * hour=0 of the *same* date parts rather than blindly subtracting 24 h,
 * which would produce an off-by-one error.
 */
export function getUtcOffsetMs(utcMs: number, tz: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  let year = get("year");
  let month = get("month") - 1; // JS months are 0-based
  let day = get("day");
  let hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  // Normalise hour=24: treat it as hour=0 of the same calendar date rather
  // than incrementing the day, which avoids an off-by-one when the Intl
  // implementation returns midnight-as-24.
  if (hour === 24) {
    hour = 0;
  }

  // Reconstruct the "local" epoch by treating the wall-clock parts as UTC.
  const localMs = Date.UTC(year, month, day, hour, minute, second);
  return localMs - utcMs;
}

/**
 * Returns the UTC timestamp (ms) for the start of the calendar day that
 * contains `utcMs` in the given IANA timezone.
 *
 * Note: we compute the wall-clock offset via Intl and then strip the
 * sub-day remainder using modulo on the *local* milliseconds.  This is
 * correct for all standard timezones because Intl already accounts for DST
 * — the offset we obtain is the one actually in effect at `utcMs`, so the
 * resulting day boundary is the true wall-clock midnight in that timezone.
 */
export function startOfDayInTz(utcMs: number, tz: string): number {
  const offsetMs = getUtcOffsetMs(utcMs, tz);
  const localMs = utcMs + offsetMs;
  // Strip the time-of-day portion to get local midnight, then convert back.
  const localMidnightMs = localMs - (localMs % 86_400_000);
  return localMidnightMs - offsetMs;
}

/**
 * Returns the UTC timestamp (ms) for the end of the calendar day that
 * contains `utcMs` in the given IANA timezone (i.e. one millisecond before
 * the next midnight).
 */
export function endOfDayInTz(utcMs: number, tz: string): number {
  return startOfDayInTz(utcMs, tz) + 86_400_000 - 1;
}

// ---------------------------------------------------------------------------
// Validate an IANA timezone string without throwing.
// Returns true if the string is a valid IANA timezone identifier.
// ---------------------------------------------------------------------------
function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/analytics/summary
//
// Query params:
//   date  — ISO date string (YYYY-MM-DD) in the venue's local timezone.
//            Defaults to today in the requested timezone.
//   tz    — IANA timezone string (e.g. "Europe/Madrid").
//            Defaults to "UTC".
//
// Response:
//   {
//     date:          string,   // YYYY-MM-DD
//     tz:            string,
//     totalOrders:   number,
//     pendingOrders: number,
//     doneOrders:    number,
//   }
// ---------------------------------------------------------------------------
router.get("/summary", authenticate, async (req: Request, res: Response) => {
  const venueId = (req as any).user?.venue_id;
  if (!venueId) {
    return res.status(403).json({ error: "No venue associated with this account" });
  }

  // --- Timezone validation ---------------------------------------------------
  const rawTz = (req.query.tz as string | undefined) ?? "UTC";
  if (!isValidIanaTimezone(rawTz)) {
    return res
      .status(400)
      .json({ error: `Invalid timezone: "${rawTz}". Must be a valid IANA timezone string.` });
  }
  const tz = rawTz;

  // --- Date resolution -------------------------------------------------------
  let targetUtcMs: number;
  if (req.query.date) {
    const rawDate = req.query.date as string;
    // Parse YYYY-MM-DD as a wall-clock date in the requested timezone by
    // treating it as local midnight and converting to UTC.
    const parsed = Date.parse(`${rawDate}T00:00:00`);
    if (isNaN(parsed)) {
      return res.status(400).json({ error: `Invalid date: "${rawDate}". Expected YYYY-MM-DD.` });
    }
    // `parsed` is UTC for a naive local parse — we want the UTC instant that
    // corresponds to midnight on `rawDate` in `tz`.  We approximate by using
    // the offset at noon on that day (stable across DST in almost all cases).
    const noonUtcMs = Date.parse(`${rawDate}T12:00:00Z`);
    targetUtcMs = startOfDayInTz(noonUtcMs, tz);
  } else {
    targetUtcMs = startOfDayInTz(Date.now(), tz);
  }

  const dayStart = new Date(startOfDayInTz(targetUtcMs, tz));
  const dayEnd = new Date(endOfDayInTz(targetUtcMs, tz));

  // Derive the YYYY-MM-DD label in the requested timezone.
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dayStart);

  try {
    // --- DB query: count orders for this venue within the day window ---------
    const rows = await db
      .select({
        status: orders.status,
        count: count(),
      })
      .from(orders)
      .where(
        and(
          eq(orders.venue_id, venueId),
          gte(orders.created_at, dayStart),
          lte(orders.created_at, dayEnd)
        )
      )
      .groupBy(orders.status);

    let totalOrders = 0;
    let pendingOrders = 0;
    let doneOrders = 0;

    for (const row of rows) {
      const n = Number(row.count);
      totalOrders += n;
      if (row.status === "pending") pendingOrders += n;
      if (row.status === "done") doneOrders += n;
    }

    return res.json({
      date: dateLabel,
      tz,
      totalOrders,
      pendingOrders,
      doneOrders,
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
