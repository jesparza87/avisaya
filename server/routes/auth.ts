import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users, venues } from "../schema";
import { eq } from "drizzle-orm";
import { verifyJWT, AuthRequest } from "../middleware/auth";

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, venueName } = req.body;

    if (!email || !password || !venueName) {
      return res.status(400).json({ error: "email, password and venueName are required" });
    }

    // Check if email already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const slug = slugify(venueName);

    // Create venue first
    const [venue] = await db
      .insert(venues)
      .values({
        name: venueName,
        slug,
        plan: "free",
      })
      .returning();

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email,
        password_hash,
        venue_id: venue.id,
        role: "admin",
      })
      .returning();

    // Update venue owner_id
    await db.update(venues).set({ owner_id: user.id }).where(eq(venues.id, venue.id));

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
      return res.status(400).json({ error: "email and password are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
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
