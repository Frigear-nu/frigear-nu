// Test-only SMS driver: keeps every SMS in memory for /api/test/messages.
export const testTexts: unknown[] = ((globalThis as { __preferencesTestTexts?: unknown[] }).__preferencesTestTexts ??= [])

export default function smsDriver(notification: unknown) {
  testTexts.push(notification)
}
