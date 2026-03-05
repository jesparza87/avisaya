import { Router, Response } from "express";
import Stripe from "stripe";
import { verifyJWT, AuthRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { venues } from "../../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2024-04-10" });
}

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
};

// POST /api/billing/create-checkout
router.post(
  "/create-checkout",
  verifyJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const stripe = getStripe();
      const { plan } = req.body as { plan: "starter" | "pro" };

      if (!plan || !["starter", "pro"].includes(plan)) {
        return res
          .status(400)
          .json({ error: "Invalid plan. Must be 'starter' or 'pro'." });
      }

      const priceId = PRICE_IDS[plan];
      if (!priceId) {
        return res
          .status(500)
          .json({ error: `Price ID for plan '${plan}' is not configured.` });
      }

      const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${clientUrl}/dashboard?billing=success`,
        cancel_url: `${clientUrl}/dashboard?billing=cancelled`,
        metadata: {
          venue_id: req.user?.venue_id ?? "",
          user_id: req.user?.id ?? "",
          plan,
        },
        ...(req.user?.email ? { customer_email: req.user.email } : {}),
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error("Billing create-checkout error:", err);
      return res
        .status(500)
        .json({ error: "Failed to create checkout session." });
    }
  }
);

// POST /api/billing/webhook  (raw body required — mounted before express.json())
router.post("/webhook", async (req: AuthRequest, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    const rawBody = (req as AuthRequest & { rawBody?: Buffer }).rawBody;
    event = stripe.webhooks.constructEvent(
      rawBody ?? req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res
      .status(400)
      .json({ error: "Webhook signature verification failed." });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const venueId = session.metadata?.venue_id;
    const plan = session.metadata?.plan as string | undefined;

    if (venueId && plan) {
      try {
        await db
          .update(venues)
          .set({ plan } as Record<string, unknown>)
          .where(eq(venues.id, venueId));
        console.log(`Venue ${venueId} upgraded to plan: ${plan}`);
      } catch (dbErr) {
        console.error("Failed to update venue plan in DB:", dbErr);
      }
    }
  }

  return res.json({ received: true });
});

// GET /api/billing/portal
router.get("/portal", verifyJWT, async (req: AuthRequest, res: Response) => {
  try {
    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    let customerId: string | undefined;

    if (req.user?.email) {
      const customers = await stripe.customers.list({
        email: req.user.email,
        limit: 1,
      });
      customerId = customers.data[0]?.id;
    }

    if (!customerId) {
      return res
        .status(404)
        .json({ error: "No Stripe customer found for this account." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${clientUrl}/dashboard`,
    });

    return res.json({ url: portalSession.url });
  } catch (err) {
    console.error("Billing portal error:", err);
    return res.status(500).json({ error: "Failed to create portal session." });
  }
});

export default router;
