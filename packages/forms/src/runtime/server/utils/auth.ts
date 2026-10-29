import type { H3Event } from 'h3'

/**
 * The staff gate of the admin routes (form definitions, submissions, files, access credentials): the `forms:manage`
 * scope for bearer credentials, then the host's `forms:authorize` Nitro hook (denied by default).
 *
 *     await formsStaff.require(event)                        // reads and ordinary edits
 *     await formsStaff.require(event, { sessionOnly: true }) // minting or removing access credentials
 */
export const formsStaff = defineStaffGuard({
  hook: 'forms:authorize',
  scope: 'forms:manage',
  message: 'You are not allowed to manage forms.',
})

/** Non-throwing form of the `forms:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageForms = (event: H3Event, principal: { user: { id: number } }) => formsStaff.can(event, principal.user.id)
