// In-memory state of the test fixture, shared by its plugin and its test routes.

/** Every crew and teams hook that fired, in order. */
export const testHooks: Array<{ name: string, operationId?: string, teamId?: string, userId: number, role?: string, crewStatus?: string, from?: string, to?: string }> = []

/** Every email handed to notify, as the `notify:email` hook saw it. */
export const testEmails: Array<{ to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown> } }> = []
