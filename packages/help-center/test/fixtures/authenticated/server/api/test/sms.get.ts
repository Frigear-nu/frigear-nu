// Test-only: every text the SMS driver received, in order.
export default defineEventHandler(() => (globalThis as { __helpTestSms?: unknown[] }).__helpTestSms ?? [])
