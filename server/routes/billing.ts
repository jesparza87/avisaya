import { Router, Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import jwt from "jsonwebtoken";

const router = Router();

function verifyJWT(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.cookies && req.cookies["token"]);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    (req as Request & { user: jwt.JwtPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2024-04-10" as Stripe.LatestApiVersion });
}

// POST /api/billing/create-checkout
router.post("/create-checkout", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan } = req.body as { plan?: string };
    if (!plan || !PRICE_IDS[plan]) {
      res.status(400).json({ error: "Invalid plan. Must be 'starter' or 'pro'" });
      return;
    }
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      res.status(500).json({ error: `Price ID for plan '${plan}' is not configured` });
      return;
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/billing/cancel`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/billing/create-portal
router.post("/create-portal", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId } = req.body as { customerId?: string };
    if (!customerId) {
      res.status(400).json({ error: "customerId is required" });
      return;
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/billing`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/billing/webhook
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not set" });
    return;
  }
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
    return;
  }
  switch (event.type) {
    case "checkout.session.completed":
      // TODO: provision subscription in DB
      break;
    case "customer.subscription.deleted":
      // TODO: revoke subscription in DB
      break;
    default:
      break;
  }
  res.status(200).json({ received: true });
});

export default router;
