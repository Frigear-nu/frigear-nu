// Test-only SMS driver: keeps every SMS in memory for /api/test/sms.
export const texts: unknown[] = ((globalThis as { __pushTestTexts?: unknown[] }).__pushTestTexts ??= [])

export default function smsDriver(notification: unknown) {
  texts.push(notification)
}
