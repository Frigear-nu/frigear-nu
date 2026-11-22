// Test-only email driver: keeps every email as delivered (after email templates rendered it) in memory for
// /api/test/delivered (a global, because the driver is bundled apart).
export const delivered: unknown[] = ((globalThis as { __helpTestDelivered?: unknown[] }).__helpTestDelivered ??= [])

export default function mailDriver(notification: unknown) {
  delivered.push(notification)
}
