# avisaya

Existing project — see repo for full documentation.

## Changes in this PR

- `server/index.ts`: mounts `/api/billing/webhook` with `express.raw()` **before** `express.json()` so Stripe signature verification receives the raw Buffer; adds fast-fail warning when `STRIPE_SECRET_KEY` is missing; imports and mounts `billingRouter`.
- `server/routes.ts`: imports `billingRouter` from `./routes/billing` and mounts it at `/api/billing`, satisfying the router-mount coherence requirement.
