# AvisaYa — Stripe Billing

See main project README for full documentation.

## Billing endpoints

- `POST /api/billing/create-checkout` — create Stripe Checkout session (requires JWT)
- `POST /api/billing/create-portal` — create Stripe billing portal session (requires JWT)
- `POST /api/billing/webhook` — Stripe webhook receiver

## Required env vars

```
STRIPE_SECRET_KEY=sk_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
