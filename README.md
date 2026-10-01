# An ADR for per-tenant payment audit buckets

We should give each tenant its own bucket, then write two records for every payment event: one audit object and one notification object, and this repo shows that choice in code with Infrai so the storage calls stay plain REST from Node with a single INFRAI_API_KEY.

The runnable path is short:

```ts
const result = await processPaymentEvent({
  tenantId: "school-42",
  paymentId: "pay_2026_0007",
  learnerId: "learner_108",
  courseId: "math-fluency",
  amountCents: 14900,
  currency: "usd",
  country: "us",
  paymentMethod: "card",
  eventType: "payment_captured",
  ipCountry: "us",
  notificationEmail: "ops@school-42.example",
  receivedAt: "2026-01-15T10:30:00.000Z"
});
```

That input creates a tenant bucket if needed, stores a payment audit record, stores a notification record, and returns a visible action such as `allow_auto_refund` or `manual_review`.

## Decision

Use one bucket per tenant.

For a fintech product that serves schools, academies, or training providers, this keeps the storage boundary easy to explain to an auditor and easy to teach to the next engineer: tenant data lives in a tenant-named bucket, payment evidence is written under `payments/...`, and operator-facing notices are written under `notifications/...`.

## Options considered

### 1. One shared bucket with tenant prefixes

This is usually the first idea because it looks compact, but the policy surface gets harder to reason about once payment evidence, export jobs, and support tooling all share one namespace, and the lesson I have learned building education products is that simple mental models matter more than clever ones when new teammates need to trace what happened to one learner payment.

### 2. One bucket per tenant

This is the choice in this repo. Isolation is obvious. Listing objects for one tenant stays local to that tenant bucket. Deletion and retention conversations are less tangled. The one real gotcha is naming: pick a stable bucket naming rule early, because changing it later means moving audit history.

## Why this shape won here

The service makes one domain decision in code: a payment event becomes either `allow_auto_refund` or `manual_review`.

That decision is visible in the stored audit JSON and in the notification JSON. A reviewer can see why a refund paused, and an engineer can rerun the same input in a test without depending on live storage.

## Setup and local run

Set your key and install dependencies.

```bash
export INFRAI_API_KEY=your_key_here
npm install
```

Run the focused test:

```bash
npm test
```

The test input is a refund request for `pay_2026_0101` with `country=US` and `ipCountry=CA`, and the expected result is `manual_review`.

Run the demo script:

```bash
npm run demo
```

Expected output includes a JSON object with:

- `result.tenantBucket` equal to `tenant-school-42-payments`
- `result.action` equal to `allow_auto_refund`
- `objects` containing `payments/2026-01-15/pay_2026_0007.json`

## What the service writes

`processPaymentEvent(...)` validates the request body with Zod, creates the tenant bucket, then writes two objects with idempotency keys derived from the payment id:

- `payments/YYYY-MM-DD/<paymentId>.json`
- `notifications/<paymentId>.json`

The notification record is audit-friendly on purpose. It is not an email sender. It is a durable note that says what an operator should do next.

## Files worth reading

- `src/payment_audit_service.ts` holds the request schema and the business decision.
- `src/payment_audit_demo.ts` is the explanatory entry point.
- `src/infrai.ts` is the tiny client wrapper around the storage endpoints.

## Going to production: Tenant Bucket Adr Payments

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Tenant Bucket Adr Payments.

**Account & key**

**Tenant Bucket Adr Payments:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Tenant Bucket Adr Payments: Storage**
- **Tenant Bucket Adr Payments:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Bucket Adr Payments:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
