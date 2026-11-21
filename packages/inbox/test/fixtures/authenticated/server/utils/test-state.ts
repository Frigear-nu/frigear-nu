// In-memory state of the test fixture, shared by its plugins, its fake channel and its test routes.

/** Every inbox hook that fired, in order. */
export const testInboxHooks: Array<{ name: string, threadId: string, messageId?: string, data?: Record<string, unknown> }> = []

/** Every email that reached `notify:email`, in order. */
export const testEmails: Array<{ to: string | string[], subject: string, body: string, text?: string, replyTo?: string }> = []

/** What the fake channel delivered. */
export const testSent: Array<{ threadId: string, to: string, body: string, secret?: string }> = []

/** user id -> team ids they lead, standing in for teams' `isTeamLead`. */
export const testLeads = new Map<string, Set<string>>()
