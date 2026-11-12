import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { AuthPrincipal } from '../../types'
import { hashToken, shouldTouchLastUsed, tokenStatus } from '../../utils/tokens'

/** Resolves user API tokens (`fnu_` unless `apiTokens.prefix` says otherwise). The user is loaded fresh, so role changes apply immediately. */
export default async function resolveUserToken(_event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const [row] = await db.select().from(schema.authUserTokens).where(eq(schema.authUserTokens.tokenHash, await hashToken(token))).limit(1)
  if (!row || tokenStatus(row) !== 'ok') return null

  const user = await loadAuthUser(row.userId)
  if (!user) return null

  if (shouldTouchLastUsed(row.lastUsedAt)) {
    // Usage tracking must never fail a request.
    await db.update(schema.authUserTokens).set({ lastUsedAt: new Date() }).where(eq(schema.authUserTokens.id, row.id)).catch(() => {})
  }

  // Tokens minted since permissions are frozen carry them; older ones get theirs computed per request (`resolveBearer`).
  return {
    kind: 'user-token',
    user,
    scopes: row.scopes,
    ...(Array.isArray(row.permissions) && { permissions: row.permissions }),
    token: { id: row.id, name: row.name, prefix: row.prefix },
  }
}
