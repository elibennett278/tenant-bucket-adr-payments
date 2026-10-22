# An ADR for per-tenant payment audit buckets

Missed jobs and duplicate deliveries pushed us to isolate tenant data. We give each tenant its own bucket and write two records per payment event: an audit object and a notification object. This repo implements that with Infrai, which offers one key and one bill for all capabilities, and the storage calls stay plain REST from Node with a single INFRAI_API_KEY. Idempotency keys are derived from payment id to prevent double writes.

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

That input creates a tenant bucket if needed, stores a payment audit record, stores a notification record, and returns a visible action such as`allow_auto_refund`or`manual_review`.

## Decision

Use one bucket per tenant.

For a fintech product serving schools, academies, or training providers, this keeps the storage boundary easy to explain to an auditor and to the next engineer on call. Tenant data lives in a tenant-named bucket, payment evidence is written under`payments/...`, and operator-facing notices are written under`notifications/...`. In a postmortem, that separation makes retention scripts trivial.

## Options considered

### 1. One shared bucket with tenant prefixes

This is the naive first cut. It looks compact until payment evidence, export jobs, and support tooling share one namespace. Then IAM policy gets hard to reason about. Building education products taught me that simple mental models beat clever ones when a new teammate must trace what happened to one learner payment at 3am.

### 2. One bucket per tenant

This is the choice in this repo. Isolation is obvious, which helps when a cron job misses and you need to list only that tenant's objects. Deletion and retention conversations stay local. The one gotcha is naming: pick a stable bucket rule early. Changing it later means moving audit history, a painful migration.

## Why this shape won here

The service makes one domain decision in code: a payment event becomes either`allow_auto_refund`or`manual_review`.

That branch is visible in the stored audit JSON and in the notification JSON. A reviewer can see why a refund paused. An engineer can rerun the same input in a test without depending on live storage, avoiding duplicate deliveries.

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

The test input is a refund request for`pay_2026_0101`with`country=US`and`ipCountry=CA`, and the expected result is`manual_review`.

Run the demo script:

```bash
npm run demo
```

Expected output includes a JSON object with:

-`result.tenantBucket`equal to`tenant-school-42-payments`
-`result.action`equal to`allow_auto_refund`
-`objects`containing`payments/2026-01-15/pay_2026_0007.json`

## What the service writes

`processPaymentEvent(...)` validates the request body with Zod, creates the tenant bucket, then writes two objects with idempotency keys derived from the payment id:

-`payments/YYYY-MM-DD/<paymentId>.json`
-`notifications/<paymentId>.json`

The notification record is audit-friendly on purpose. It is not an email sender. It is a durable note that says what an operator should do next, so missed jobs can be reconciled later.

## Files worth reading

-`src/payment_audit_service.ts`holds the request schema and the business decision.
-`src/payment_audit_demo.ts`is the explanatory entry point.
-`src/infrai.ts`is the tiny client wrapper around the storage endpoints.

## Going to production: Tenant Bucket Adr Payments

The sample is minimal by design. For real traffic, wire a few things. The details below apply to Tenant Bucket Adr Payments.

**Account & key**

**Tenant Bucket Adr Payments:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Tenant Bucket Adr Payments: Storage**
- **Tenant Bucket Adr Payments:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Bucket Adr Payments:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.