import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AuthScopeAvailabilityContext } from '../../../types'
import { scopes as registeredScopes } from '#auth/scopes'
import { tokenStatus } from '../../utils/tokens'

type TokenRow = typeof schema.authUserTokens.$inferSelect

/** What the API returns about a token: never the hash. */
export function toPublicToken(row: TokenRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    status: tokenStatus(row),
  }
}

export const newTokenId = () => `aut_${crypto.randomUUID().replaceAll('-', '')}`

/**
 * The registered scopes this user may pick for a token: those restricted by `roles` for other roles
 * and those a `auth:scope-available` hook hides are left out. A failing hook hides the scope.
 */
export async function availableScopes(event: H3Event, user: { id: number, role?: string }) {
  const hooks = useNitroApp().hooks
  const result: typeof registeredScopes = []
  for (const scope of registeredScopes) {
    if (scope.roles?.length && !(user.role && scope.roles.includes(user.role))) continue
    const ctx: AuthScopeAvailabilityContext = { event, user, scope, available: true }
    try {
      await hooks.callHook('auth:scope-available', ctx)
    }
    catch (error) {
      console.error('[auth] scope availability hook failed, hiding scope', scope.name, error)
      ctx.available = false
    }
    if (ctx.available) result.push(scope)
  }
  return result
}

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).min(1),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
})

export const listUserTokens = (userId: string) =>
  db.select().from(schema.authUserTokens).where(eq(schema.authUserTokens.userId, userId)).orderBy(desc(schema.authUserTokens.createdAt))

export const findUserToken = async (userId: string, id: string) => {
  const [row] = await db.select().from(schema.authUserTokens)
    .where(and(eq(schema.authUserTokens.id, id), eq(schema.authUserTokens.userId, userId))).limit(1)
  return row
}
