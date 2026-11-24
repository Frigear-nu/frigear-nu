import { z } from 'zod'
import { apiError, created, notConfigured, notFound } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({
  /** Where the window goes once signed in (a path on this site). */
  redirect: z.string().max(2048).optional(),
  /** Step-up scopes (`frigear.sso.stepUpScopes` allowlist), as `/auth/frigear?scope=` takes them. */
  scope: z.string().max(1024).optional(),
}).optional()

// `POST /api/auth/frigear/handoffs`: starts "Log in with frigear.nu" in the system browser for this window (201). Sets
// the window's attempt cookie and answers the attempt with the `authorizeUrl` to open outside the window. Only on a
// server reached over loopback (a desktop app's own server).
export default defineEventHandler(async (event) => {
  const sso = resolveFrigearSso(event)
  if (!sso.enabled || !sso.handoff.enabled) throw notFound()
  assertAuthSameOrigin(event)
  if (!isFrigearHandoffLoopback(event)) {
    throw apiError(403, 'handoff_not_local', 'Signing in in the system browser is only offered by a server on this device.')
  }
  const body = await readValidatedBody(event, bodySchema.parse) ?? {}
  if (!sso.clientId) throw notConfigured('frigear.nu has no client id configured (`frigear.sso.clientId`).')
  await enforceAuthRateLimit(event, 'frigear-handoff')
  return created(event, await startFrigearHandoff(event, sso, { redirect: body.redirect, scopes: frigearLoginScopes(sso, body.scope) }))
})
