import type { H3Event } from 'h3'

// Default server-side resolver: the caller's principal from `@frigear-nu/auth` (`{ kind, user, scopes }`) - the
// cookie session, or a bearer credential (user API token, OAuth access token) - so route rules see how the caller
// authenticated, not just who they are.
// Override with `authorization.resolvers.server` (a path to a default-export function). It may return a principal or
// just a user (treated as a cookie session).
export default async function resolveServerUser(event: H3Event) {
  return await getAuth(event)
}
