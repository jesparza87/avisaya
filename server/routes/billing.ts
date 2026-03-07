import { Router, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { verifyJWT } from "../middleware/auth";
import { db } from "../db";
import { venues } from "../schema";
import { eq } from "drizzle-orm";

const router = Router();

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2024-04-10",
  });
}

// POST /api/billing/create-checkout
router.post("/create-checkout", verifyJWT, async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body as { plan: string };
    const priceId =
      plan === "pro"
        ? process.env.STRIPE_PRO_PRICE_ID ?? ""
        : process.env.STRIPE_STARTER_PRICE_ID ?? "";

    const user = (req as Request & { user?: { venueId?: string } }).user;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL ?? "http://localhost:5173"}/dashboard?checkout=success`,
      cancel_url: `${process.env.CLIENT_URL ?? "http://localhost:5173"}/dashboard?checkout=cancel`,
      metadata: { venueId: user?.venueId ?? "", plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// POST /api/billing/webhook — raw body required for signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? ""
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const venueId = session.metadata?.venueId;
        const plan = session.metadata?.plan ?? "starter";
        if (venueId) {
          await db.update(venues).set({ plan }).where(eq(venues.id, venueId));
        }
      }

      res.json({ received: true });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  }
);

// GET /api/billing/portal
router.get("/portal", verifyJWT, async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const user = (req as Request & { user?: { stripeCustomerId?: string } }).user;
    const session = await stripe.billingPortal.sessions.create({
      customer: user?.stripeCustomerId ?? "",
      return_url: `${process.env.CLIENT_URL ?? "http://localhost:5173"}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
