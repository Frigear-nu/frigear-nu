import type { H3Event } from 'h3'

// The host decides who is staff through the `forms:authorize` Nitro hook. Denied by default.
const gate = definePolicyGate('forms:authorize')

/** Gate for the admin routes (form definitions, submissions, files). */
export async function requireFormsManager(event: H3Event): Promise<{ userId: number }> {
  const user = await requireUser(event, { scopes: ['forms:manage'] })
  await gate.assert(event, user.id, 'You are not allowed to manage forms.')
  return { userId: user.id }
}

/** Non-throwing form of the `forms:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageForms = (event: H3Event, principal: { user: { id: number } }) => gate.isAllowed(event, principal.user.id)
