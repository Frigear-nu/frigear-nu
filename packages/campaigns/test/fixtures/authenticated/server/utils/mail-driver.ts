// Test-only email driver: keeps every email as delivered (after email templates rendered it) in memory for
// /api/test/messages (a global, because the driver is bundled apart).
export const campaignsTestMails: unknown[] = ((globalThis as { __campaignsTestMails?: unknown[] }).__campaignsTestMails ??= [])

export default function mailDriver(notification: unknown) {
  campaignsTestMails.push(notification)
}
