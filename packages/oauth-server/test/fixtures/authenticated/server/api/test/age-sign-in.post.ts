import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

// Test only: moves the sign-in time (`authTime`) of a user's refresh tokens in an application into the past, as if they
// had signed in that many seconds ago, and returns the live rows' expiry so tests can check lifetimes.
const bodySchema = z.object({ userId: z.number(), applicationId: z.string(), seconds: z.number().int().min(0) })

export default defineEventHandler(async (event) => {
  const { userId, applicationId, seconds } = await readValidatedBody(event, bodySchema.parse)
  const t = schema.oauthRefreshTokens
  const where = and(eq(t.userId, userId), eq(t.applicationId, applicationId))
  if (seconds) await db.update(t).set({ authTime: new Date(Date.now() - seconds * 1000) }).where(where)
  const rows = await db.select({ familyId: t.familyId, expiresAt: t.expiresAt, revokedAt: t.revokedAt }).from(t).where(where)
  return rows.map(row => ({ familyId: row.familyId, expiresAt: row.expiresAt.toISOString(), revoked: !!row.revokedAt }))
})
