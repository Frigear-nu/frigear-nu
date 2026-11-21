// Test-only SMS driver: keeps every text in memory for /api/test/sms (a global, because the driver is bundled apart).
export const texts: unknown[] = ((globalThis as { __helpTestSms?: unknown[] }).__helpTestSms ??= [])

export default function smsDriver(notification: unknown) {
  texts.push(notification)
}
