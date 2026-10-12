import type { H3Event } from 'h3'
import { resolveAccess } from '../../utils'

type FormRow = Parameters<typeof authorizeFormAccess>[1]

/**
 * Forms reachable over MCP: those open to everyone or to signed-in users. Forms gated by a
 * per-form token or password are refused, since the MCP credential is the user's own and must
 * never be presented as (or confused with) a form credential.
 */
export async function assertMcpFormAccess(event: H3Event, form: FormRow) {
  const { auth } = resolveAccess(form.definition)
  if (auth === 'token' || auth === 'password') {
    throw createError({ statusCode: 403, statusMessage: 'This form needs its own access token or password and cannot be used through MCP.' })
  }
  await authorizeFormAccess(event, form)
}
