import type { H3Event } from 'h3'

// Default server-side user resolver: the logged-in user from nuxt-auth-utils' session.
// Override with `authorization.resolvers.server` (a path to a default-export function).
export default async function resolveServerUser(event: H3Event) {
  const session = await getUserSession(event)
  return session.user ?? null
}
