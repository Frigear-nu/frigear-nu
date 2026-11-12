import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AuthTokenDto } from '../../../types'
import { tokenStatus } from '../../utils/tokens'

type TokenRow = typeof schema.authUserTokens.$inferSelect

/** What the API returns about a token: never the hash. */
export function toAuthTokenDto(row: TokenRow): AuthTokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    scopes: row.scopes,
    permissions: row.permissions ?? null,
    expiresAt: isoDate(row.expiresAt),
    lastUsedAt: isoDate(row.lastUsedAt),
    createdAt: isoDate(row.createdAt),
    status: tokenStatus(row),
  }
}

export const newTokenId = () => `aut_${crypto.randomUUID().replaceAll('-', '')}`

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
