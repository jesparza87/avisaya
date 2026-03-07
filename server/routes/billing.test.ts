import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

// ── Stripe mock ──────────────────────────────────────────────────────────────
const mockCheckoutCreate = jest.fn();
const mockPortalCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }));
});

// ── DB mock ──────────────────────────────────────────────────────────────────
jest.mock("../db", () => ({
  db: { update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn() }) }) },
}));

// ── verifyJWT mock — always passes, attaches fake user ───────────────────────
jest.mock("../middleware/auth", () => ({
  verifyJWT: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: object }).user = { venueId: "venue-1", stripeCustomerId: "cus_123" };
    next();
  },
}));

// ── drizzle helpers mock ─────────────────────────────────────────────────────
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
jest.mock("../schema", () => ({ venues: {} }));

import billingRoutes from "./billing";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/billing", billingRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("POST /api/billing/create-checkout", () => {
  it("returns 200 with checkout url for starter plan", async () => {
    mockCheckoutCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/starter" });
    const res = await request(buildApp())
      .post("/api/billing/create-checkout")
      .send({ plan: "starter" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/starter" });
  });

  it("returns 200 with checkout url for pro plan", async () => {
    mockCheckoutCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pro" });
    const res = await request(buildApp())
      .post("/api/billing/create-checkout")
      .send({ plan: "pro" });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/pro");
  });

  it("returns 500 when stripe throws", async () => {
    mockCheckoutCreate.mockRejectedValueOnce(new Error("stripe error"));
    const res = await request(buildApp())
      .post("/api/billing/create-checkout")
      .send({ plan: "starter" });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("stripe error");
  });
});

describe("POST /api/billing/webhook", () => {
  it("returns 200 with received:true on valid event", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { metadata: { venueId: "venue-1", plan: "pro" } } },
    });
    const res = await request(buildApp())
      .post("/api/billing/webhook")
      .set("stripe-signature", "sig_test")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({}));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("returns 400 when constructEvent throws", async () => {
    mockConstructEvent.mockImplementationOnce(() => { throw new Error("bad sig"); });
    const res = await request(buildApp())
      .post("/api/billing/webhook")
      .set("stripe-signature", "bad")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({}));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("bad sig");
  });
});

describe("GET /api/billing/portal", () => {
  it("returns 200 with portal url", async () => {
    mockPortalCreate.mockResolvedValueOnce({ url: "https://billing.stripe.com/portal" });
    const res = await request(buildApp()).get("/api/billing/portal");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://billing.stripe.com/portal" });
  });

  it("returns 500 when stripe throws", async () => {
    mockPortalCreate.mockRejectedValueOnce(new Error("portal error"));
    const res = await request(buildApp()).get("/api/billing/portal");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("portal error");
  });
});
