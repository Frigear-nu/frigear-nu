import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import loadUser from '#auth/user-loader'
import type { AuthPrincipal } from '../../types'
import { hashToken, shouldTouchLastUsed, tokenStatus } from '../../utils/tokens'

/** Resolves `fnu_` user API tokens. The user is loaded fresh, so role changes apply immediately. */
export default async function resolveUserToken(_event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const [row] = await db.select().from(schema.authUserTokens).where(eq(schema.authUserTokens.tokenHash, await hashToken(token))).limit(1)
  if (!row || tokenStatus(row) !== 'ok') return null

  const user = await loadUser(row.userId)
  if (!user) return null

  if (shouldTouchLastUsed(row.lastUsedAt)) {
    // Usage tracking must never fail a request.
    await db.update(schema.authUserTokens).set({ lastUsedAt: new Date() }).where(eq(schema.authUserTokens.id, row.id)).catch(() => {})
  }

  return { kind: 'user-token', user, scopes: row.scopes, token: { id: row.id, name: row.name, prefix: row.prefix } }
}
