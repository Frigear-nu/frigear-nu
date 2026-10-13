import type { H3Event } from 'h3'

// The host decides who is staff through the `events:authorize` Nitro hook. Denied by default.
const gate = definePolicyGate('events:authorize')

/** Gate for staff routes (event/ticket management, check-in). */
export async function requireEventsManager(event: H3Event): Promise<{ userId: number }> {
  const user = await requireUser(event, { scopes: ['events:manage'] })
  await gate.assert(event, user.id, 'You are not allowed to manage events.')
  return { userId: user.id }
}

/** Non-throwing form of the `events:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageEvents = (event: H3Event, principal: { user: { id: number } }) => gate.isAllowed(event, principal.user.id)
