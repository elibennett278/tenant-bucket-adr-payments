import test from "node:test";
import assert from "node:assert/strict";
import { decideRiskAction } from "../src/payment_audit_service";

test("refund from a mismatched country goes to manual review", () => {
  const action = decideRiskAction({
    tenantId: "school-42",
    paymentId: "pay_2026_0101",
    learnerId: "learner_108",
    courseId: "math-fluency",
    amountCents: 4900,
    currency: "USD",
    country: "US",
    paymentMethod: "card",
    eventType: "refund_requested",
    ipCountry: "CA",
    notificationEmail: "ops@school-42.example",
    receivedAt: "2026-01-15T10:30:00.000Z"
  });

  assert.equal(action, "manual_review");
});
