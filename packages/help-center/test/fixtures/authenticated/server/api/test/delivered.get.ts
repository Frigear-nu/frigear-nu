// Test-only: every email the mail driver received, as delivered, in order.
export default defineEventHandler(() => (globalThis as { __helpTestDelivered?: unknown[] }).__helpTestDelivered ?? [])
