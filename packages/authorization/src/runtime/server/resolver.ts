import type { H3Event } from 'h3'

// Default server-side user resolver: the caller from `@frigear-nu/auth` - the cookie session, or
// a bearer credential (user API token, OAuth access token) - so route rules apply to both.
// Override with `authorization.resolvers.server` (a path to a default-export function).
export default async function resolveServerUser(event: H3Event) {
  const auth = await getAuth(event)
  return auth?.user ?? null
}
