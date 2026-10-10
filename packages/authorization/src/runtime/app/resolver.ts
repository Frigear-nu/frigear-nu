// Default client-side user resolver: the logged-in user from nuxt-auth-utils' session.
// Override with `authorization.resolvers.client` (a path to a default-export function).
export default function resolveClientUser() {
  return useUserSession().user.value ?? null
}
