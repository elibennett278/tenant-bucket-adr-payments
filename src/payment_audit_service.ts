import { z } from "zod";
import { infrai } from "./infrai";

const paymentEventSchema = z.object({
  tenantId: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/),
  paymentId: z.string().min(3).max(80),
  learnerId: z.string().min(3).max(80),
  courseId: z.string().min(3).max(80),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  country: z.string().length(2).transform((value) => value.toUpperCase()),
  paymentMethod: z.enum(["card", "bank_transfer", "wallet"]),
  eventType: z.enum(["payment_captured", "refund_requested"]),
  ipCountry: z.string().length(2).transform((value) => value.toUpperCase()),
  notificationEmail: z.string().email(),
  receivedAt: z.string().datetime()
});

export type PaymentEventInput = z.input<typeof paymentEventSchema>;
export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type RiskDecision = "allow_auto_refund" | "manual_review";

export type ProcessedPaymentEvent = {
  tenantBucket: string;
  auditKey: string;
  notificationKey: string;
  action: RiskDecision;
  notificationSubject: string;
};

export function tenantBucketName(tenantId: string): string {
  return `tenant-${tenantId}-payments`;
}

export function decideRiskAction(event: PaymentEvent): RiskDecision {
  const amountThreshold = event.amountCents >= 100000;
  const geographyMismatch = event.country !== event.ipCountry;
  const walletRefund = event.eventType === "refund_requested" && event.paymentMethod === "wallet";

  if (amountThreshold || geographyMismatch || walletRefund) {
    return "manual_review";
  }

  return "allow_auto_refund";
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8").toString("base64");
}

function auditObjectKey(event: PaymentEvent): string {
  const date = event.receivedAt.slice(0, 10);
  return `payments/${date}/${event.paymentId}.json`;
}

function notificationObjectKey(event: PaymentEvent): string {
  return `notifications/${event.paymentId}.json`;
}

export async function processPaymentEvent(input: PaymentEventInput): Promise<ProcessedPaymentEvent> {
  const event = paymentEventSchema.parse(input);
  const bucket = tenantBucketName(event.tenantId);
  const action = decideRiskAction(event);
  const auditKey = auditObjectKey(event);
  const notificationKey = notificationObjectKey(event);

  await infrai.storage.bucket.create({ name: bucket });

  const auditRecord = {
    kind: "payment_audit_record",
    tenantId: event.tenantId,
    paymentId: event.paymentId,
    learnerId: event.learnerId,
    courseId: event.courseId,
    eventType: event.eventType,
    amountCents: event.amountCents,
    currency: event.currency,
    decision: action,
    receivedAt: event.receivedAt
  };

  const notificationRecord = {
    to: event.notificationEmail,
    subject: action === "manual_review"
      ? `Manual review needed for payment ${event.paymentId}`
      : `Payment ${event.paymentId} stored for tenant ${event.tenantId}`,
    body: action === "manual_review"
      ? `A reviewer should inspect ${event.paymentId} before refund handling continues.`
      : `The payment event for learner ${event.learnerId} is now in the tenant audit bucket.`
  };

  await infrai.storage.object.put(bucket, auditKey, {
    data_base64: encodeJson(auditRecord),
    content_type: "application/json",
    idempotency_key: `${event.paymentId}:audit`
  });

  await infrai.storage.object.put(bucket, notificationKey, {
    data_base64: encodeJson(notificationRecord),
    content_type: "application/json",
    idempotency_key: `${event.paymentId}:notification`
  });

  return {
    tenantBucket: bucket,
    auditKey,
    notificationKey,
    action,
    notificationSubject: notificationRecord.subject
  };
}

export async function listTenantAuditObjects(tenantId: string): Promise<string[]> {
  const bucket = tenantBucketName(tenantId);
  const result = await infrai.storage.object.list(bucket);
  return result.data.items.map((item) => item.key);
}
