# AvisaYa — Stripe Billing

Adds Stripe billing (checkout, webhook, customer portal) to the existing AvisaYa repo.

## Changes

| File | Change |
|---|---|
| `package.json` | Added `stripe ^14.0.0` dependency |
| `server/routes/billing.ts` | New Express router: `/create-checkout`, `/webhook`, `/portal` |
| `server/index.ts` | Mounted billing router at `/api/billing` |

## New env vars required

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Endpoints

- `POST /api/billing/create-checkout` — body `{ plan: 'starter' | 'pro' }` → `{ url }`
- `POST /api/billing/webhook` — Stripe webhook (raw body, `stripe-signature` header)
- `GET /api/billing/portal` → `{ url }`

All endpoints except `/webhook` require a valid JWT cookie.
