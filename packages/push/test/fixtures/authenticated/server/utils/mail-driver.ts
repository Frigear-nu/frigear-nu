// Test-only email driver: keeps every email in memory for /api/test/mails.
export const mails: unknown[] = ((globalThis as { __pushTestMails?: unknown[] }).__pushTestMails ??= [])

export default function mailDriver(notification: unknown) {
  mails.push(notification)
}
