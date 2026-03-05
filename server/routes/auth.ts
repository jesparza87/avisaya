import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users, venues } from "../schema";
import { eq, like } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";

const router = Router();

/**
 * Convert a venue name to a URL-safe slug.
 * Uses only standard JS — no database-specific operators.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Find a unique slug for a new venue.
 *
 * Fetches all existing slugs that start with the candidate base slug using a
 * portable LIKE query (no PostgreSQL-specific operators such as ~), then
 * determines the next available suffix in JavaScript.
 *
 * This is fully compatible with any SQL database and is testable without a
 * PostgreSQL-specific mock.
 */
async function uniqueSlug(base: string): Promise<string> {
  const rows = await db
    .select({ slug: venues.slug })
    .from(venues)
    .where(like(venues.slug, `${base}%`));

  const existingSlugs = new Set((rows as Array<{ slug: string }>).map((r) => r.slug));

  if (!existingSlugs.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingSlugs.has(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, venueName } = req.body;

    if (!email || !password || !venueName) {
      return res
        .status(400)
        .json({ error: "email, password and venueName are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "La contraseña debe tener al menos 8 caracteres" });
    }

    // Check if email already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if ((existing as unknown[]).length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const baseSlug = slugify(venueName);
    const slug = await uniqueSlug(baseSlug);

    // Create venue first
    const venueRows = await db
      .insert(venues)
      .values({
        name: venueName,
        slug,
        plan: "free",
      })
      .returning();

    const venue = (venueRows as Array<{ id: string; slug: string }>)[0];

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const userRows = await db
      .insert(users)
      .values({
        email,
        password_hash,
        venue_id: venue.id,
        role: "admin",
      })
      .returning();

    const user = (userRows as Array<{
      id: string;
      email: string;
      venue_id: string;
      role: string;
    }>)[0];

    // Update venue owner_id
    await db
      .update(venues)
      .set({ owner_id: user.id })
      .where(eq(venues.id, venue.id));

    return res.status(201).json({
      message: "Registration successful",
      user: {
        id: user.id,
        email: user.email,
        venue_id: user.venue_id,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "email and password are required" });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = (rows as Array<{
      id: string;
      email: string;
      password_hash: string;
      venue_id: string;
      role: string;
    }>)[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "JWT_SECRET not configured" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        venue_id: user.venue_id,
        role: user.role,
      },
      secret,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        venue_id: user.venue_id,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return res.status(200).json({ message: "Logged out successfully" });
});

// GET /api/auth/me
router.get("/me", verifyJWT, (req: AuthRequest, res: Response) => {
  return res.status(200).json({ user: req.user });
});

export default router;
