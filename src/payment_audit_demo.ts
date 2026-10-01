import { listTenantAuditObjects, processPaymentEvent } from "./payment_audit_service";

async function main(): Promise<void> {
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

  const objects = await listTenantAuditObjects("school-42");

  console.log(JSON.stringify({ result, objects }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
