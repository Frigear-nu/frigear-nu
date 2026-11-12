import type { H3Event } from 'h3'

/** How `requireUser` lets callers in. Authentication only: check what the caller may do with `authorize`. */
export type RequireUserAuthOptions = {
  /** Reject bearer credentials (user tokens, OAuth access tokens). Use for account-level actions. */
  sessionOnly?: boolean
}

/**
 * The signed-in user, or a thrown 401 (403 `session_required` with `sessionOnly` and a bearer credential). It only says
 * who is calling: authorize what they do with `authorize(event, permission)`, which also returns the principal.
 */
export async function requireUser(event: H3Event, options: RequireUserAuthOptions = {}) {
  return (await requireAuth(event, { sessionOnly: options.sessionOnly })).user
}

/**
 * The caller's user when there is one, otherwise `null` (never throws). For routes that are open to everyone but
 * personalise for a signed-in user. Authentication only: a bearer credential counts whatever it may do, so check a
 * permission with `allows(event, permission)` before using it for anything beyond the caller's identity.
 */
export async function getUser(event: H3Event) {
  return (await getAuth(event))?.user ?? null
}
