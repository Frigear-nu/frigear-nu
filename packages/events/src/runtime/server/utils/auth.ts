import type { H3Event } from 'h3'

/**
 * The staff gate of every `/api/admin/events` route (event and ticket management, check-in). The host decides who is
 * staff through the `events:authorize` Nitro hook; denied by default. Bearer tokens need the `events:manage` scope.
 */
export const eventsStaff = defineStaffGuard({
  hook: 'events:authorize',
  scope: 'events:manage',
  message: 'You are not allowed to manage events.',
})

/** Non-throwing form of the `events:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageEvents = (event: H3Event, principal: { user: { id: number } }) => eventsStaff.can(event, principal.user.id)
