// Test-only email driver: keeps every email in memory for /api/test/mails.
export const mails: unknown[] = ((globalThis as { __testMails?: unknown[] }).__testMails ??= [])

export default function mailDriver(notification: unknown) {
  mails.push(notification)
}
