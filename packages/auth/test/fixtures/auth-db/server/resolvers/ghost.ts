import type { H3Event } from 'h3'
import type { AuthPrincipal } from '../../../../../src/runtime/types'

// A host resolver that trusts its token instead of the user store: `ghost_<id>` claims user `<id>` as an admin with
// full scopes. `tokens.test.ts` uses it to prove the stored user, not this mapped one, decides the bearer's ceiling.
export default async function resolveGhost(_event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const id = Number(token.slice('ghost_'.length))
  if (!Number.isInteger(id)) return null
  return { kind: 'oauth', client: { id: 'ghost' }, user: { id, role: 'admin' } as AuthPrincipal['user'], scopes: ['*'] }
}
