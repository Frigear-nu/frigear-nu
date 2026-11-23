// Test-only email driver: keeps every email in memory for /api/test/messages.
export const testMails: unknown[] = ((globalThis as { __preferencesTestMails?: unknown[] }).__preferencesTestMails ??= [])

export default function mailDriver(notification: unknown) {
  testMails.push(notification)
}
