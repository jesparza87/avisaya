import { Router, Response } from "express";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { orders } from "../../shared/schema";
import { and, eq, gte, lte, count } from "drizzle-orm";

const router = Router();

/**
 * Build UTC day boundaries from a YYYY-MM-DD date string.
 * An optional tzOffsetMinutes (e.g. -120 for UTC+2) shifts the wall-clock
 * midnight into UTC so that "today" is correct for the requesting client.
 *
 * Examples:
 *   date="2024-06-15", tzOffsetMinutes=0   → from=2024-06-15T00:00:00.000Z  to=2024-06-16T00:00:00.000Z
 *   date="2024-06-15", tzOffsetMinutes=-120 → from=2024-06-14T22:00:00.000Z  to=2024-06-15T22:00:00.000Z
 *
 * The upper bound is the start of the NEXT day. Using lte against next-midnight
 * correctly includes all timestamps up to and including 23:59:59.999 of the
 * requested day, and also correctly includes any order inserted at exactly
 * 00:00:00.000 of the requested day via the gte lower bound.
 */
function dayBoundaries(
  dateStr: string,
  tzOffsetMinutes: number
): { from: Date; to: Date } {
  const fromMs =
    new Date(`${dateStr}T00:00:00.000Z`).getTime() -
    tzOffsetMinutes * 60 * 1000;
  const toMs = fromMs + 24 * 60 * 60 * 1000;
  return { from: new Date(fromMs), to: new Date(toMs) };
}

/**
 * Return today's date string (YYYY-MM-DD) in UTC.
 * Callers that need local-date accuracy should pass the `date` query param
 * together with `tzOffset`.
 */
function todayUTCString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/history?date=YYYY-MM-DD&tzOffset=-120
 *
 * Returns all orders (any status) for the venue on the given day.
 * Both /history and /stats use the same status scope (all statuses)
 * so consumers get consistent data.
 *
 * Query params:
 *   date      – YYYY-MM-DD (defaults to today in UTC)
 *   tzOffset  – client timezone offset in minutes, e.g. -120 for UTC+2
 *               (defaults to 0 / UTC)
 */
router.get(
  "/history",
  verifyJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const venueId = req.user?.venue_id;
      if (!venueId) {
        return res
          .status(403)
          .json({ error: "No venue associated with this user" });
      }

      const dateStr =
        typeof req.query.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : todayUTCString();

      const tzOffsetMinutes =
        typeof req.query.tzOffset === "string" &&
        !isNaN(Number(req.query.tzOffset))
          ? Number(req.query.tzOffset)
          : 0;

      const { from, to } = dayBoundaries(dateStr, tzOffsetMinutes);

      const result = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            gte(orders.created_at, from),
            lte(orders.created_at, to)
          )
        )
        .orderBy(orders.created_at);

      return res.json(result);
    } catch (err) {
      console.error("Analytics history error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /api/analytics/stats?date=YYYY-MM-DD&tzOffset=-120
 *
 * Returns aggregate counts for the venue on the given day.
 * Uses the same status scope as /history (all statuses) for consistency.
 *
 * Query params:
 *   date      – YYYY-MM-DD (defaults to today in UTC)
 *   tzOffset  – client timezone offset in minutes (defaults to 0 / UTC)
 */
router.get(
  "/stats",
  verifyJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const venueId = req.user?.venue_id;
      if (!venueId) {
        return res
          .status(403)
          .json({ error: "No venue associated with this user" });
      }

      const dateStr =
        typeof req.query.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : todayUTCString();

      const tzOffsetMinutes =
        typeof req.query.tzOffset === "string" &&
        !isNaN(Number(req.query.tzOffset))
          ? Number(req.query.tzOffset)
          : 0;

      const { from, to } = dayBoundaries(dateStr, tzOffsetMinutes);

      const [totalRow] = await db
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            gte(orders.created_at, from),
            lte(orders.created_at, to)
          )
        );

      const [collectedRow] = await db
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            eq(orders.status, "collected"),
            gte(orders.created_at, from),
            lte(orders.created_at, to)
          )
        );

      const [waitingRow] = await db
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            eq(orders.status, "waiting"),
            gte(orders.created_at, from),
            lte(orders.created_at, to)
          )
        );

      const [readyRow] = await db
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            eq(orders.venue_id, venueId),
            eq(orders.status, "ready"),
            gte(orders.created_at, from),
            lte(orders.created_at, to)
          )
        );

      return res.json({
        date: dateStr,
        total: Number(totalRow?.value ?? 0),
        collected: Number(collectedRow?.value ?? 0),
        waiting: Number(waitingRow?.value ?? 0),
        ready: Number(readyRow?.value ?? 0),
      });
    } catch (err) {
      console.error("Analytics stats error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
