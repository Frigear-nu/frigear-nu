// Test-only SMS driver: keeps every text in memory for /api/test/messages (a global, because the driver is bundled apart).
export const campaignsTestTexts: unknown[] = ((globalThis as { __campaignsTestTexts?: unknown[] }).__campaignsTestTexts ??= [])

export default function smsDriver(notification: unknown) {
  campaignsTestTexts.push(notification)
}
