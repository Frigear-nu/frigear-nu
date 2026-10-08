import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { ApplicationInput, OAuthApplication, UserApplicationDto } from '../../../types'
import { isSecureOrigin, matchesAllowedRoles, newId, normalizeWebsiteUrl } from '../../utils'

type ApplicationRow = typeof schema.oauthApplications.$inferSelect

const fail = (statusCode: number, statusMessage: string) => createError({ statusCode, statusMessage })

const httpsUrl = z.string().trim().max(2048).refine((value) => {
  try {
    return isSecureOrigin(new URL(value))
  }
  catch {
    return false
  }
}, 'Must be a https URL (http is only allowed for localhost).')

const names = z.array(z.string().trim().min(1).max(64)).max(50)

/** Validation shared by the admin API and `createApplication` / `updateApplication`. */
export const applicationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  websiteUrl: z.string().trim().max(2048),
  description: z.string().trim().max(1000).nullish(),
  icon: z.string().trim().max(120).nullish(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  loginUrl: httpsUrl.nullish(),
  previewUrlPattern: z.string().trim().max(2048).startsWith('https://').nullish(),
  redirectUris: z.array(httpsUrl).max(20).optional(),
  allowedRoles: names.optional(),
  tags: names.optional(),
  isActive: z.boolean().optional(),
})

export const applicationPatchSchema = applicationInputSchema.partial()

export function toApplication(row: ApplicationRow): OAuthApplication {
  const { secretHash: _secretHash, ...application } = row
  return application
}

function normalizeInput<T extends Partial<ApplicationInput>>(input: T): T {
  const next = { ...input }
  if (next.websiteUrl !== undefined) {
    try {
      next.websiteUrl = normalizeWebsiteUrl(next.websiteUrl)
    }
    catch (error) {
      throw fail(400, (error as Error).message)
    }
  }
  if (next.allowedRoles) next.allowedRoles = [...new Set(next.allowedRoles)].sort()
  if (next.tags) next.tags = [...new Set(next.tags)]
  return next
}

/** The row including `secretHash`; only for credential checks. Use `getApplication` everywhere else. */
export async function getApplicationRow(id: string): Promise<ApplicationRow | null> {
  const [row] = await db.select().from(schema.oauthApplications).where(eq(schema.oauthApplications.id, id)).limit(1)
  return row ?? null
}

export async function getApplication(id: string): Promise<OAuthApplication | null> {
  const row = await getApplicationRow(id)
  return row ? toApplication(row) : null
}

export async function listApplications(): Promise<OAuthApplication[]> {
  const rows = await db.select().from(schema.oauthApplications)
    .orderBy(desc(schema.oauthApplications.priority), schema.oauthApplications.name)
  return rows.map(toApplication)
}

/** Creates an application. The returned `secret` is the only time the plain secret is available. */
export async function createApplication(input: ApplicationInput, ownerId?: number | null): Promise<{ application: OAuthApplication, secret: string }> {
  const data = normalizeInput(applicationInputSchema.parse(input))
  const secret = generateSecret()
  const [row] = await db.insert(schema.oauthApplications).values({
    id: newId('app'),
    secretHash: await sha256Hex(secret),
    ownerId: ownerId ?? null,
    ...data,
  }).returning()
  return { application: toApplication(row!), secret }
}

export async function updateApplication(id: string, patch: Partial<ApplicationInput>): Promise<OAuthApplication> {
  const data = normalizeInput(applicationPatchSchema.parse(patch))
  const [row] = Object.keys(data).length
    ? await db.update(schema.oauthApplications).set(data).where(eq(schema.oauthApplications.id, id)).returning()
    : [await getApplicationRow(id)]
  if (!row) throw fail(404, 'Application not found.')
  return toApplication(row)
}

/** Deletes the application with its authorization codes and refresh tokens. */
export async function deleteApplication(id: string): Promise<void> {
  await db.delete(schema.oauthRefreshTokens).where(eq(schema.oauthRefreshTokens.applicationId, id))
  await db.delete(schema.oauthAuthorizationCodes).where(eq(schema.oauthAuthorizationCodes.applicationId, id))
  const deleted = await db.delete(schema.oauthApplications).where(eq(schema.oauthApplications.id, id)).returning({ id: schema.oauthApplications.id })
  if (!deleted.length) throw fail(404, 'Application not found.')
}

/** Replaces the client secret and revokes the refresh tokens issued with the old one. */
export async function rotateApplicationSecret(id: string): Promise<{ secret: string }> {
  const secret = generateSecret()
  const updated = await db.update(schema.oauthApplications)
    .set({ secretHash: await sha256Hex(secret) })
    .where(eq(schema.oauthApplications.id, id))
    .returning({ id: schema.oauthApplications.id })
  if (!updated.length) throw fail(404, 'Application not found.')
  await revokeApplicationGrants(id)
  return { secret }
}

export async function verifyApplicationSecret(row: ApplicationRow, secret: string): Promise<boolean> {
  return safeEqual(await sha256Hex(secret), row.secretHash)
}

/** Revokes every refresh token of an application (e.g. after a secret leak). */
export async function revokeApplicationGrants(applicationId: string): Promise<void> {
  await db.update(schema.oauthRefreshTokens).set({ revokedAt: new Date() })
    .where(eq(schema.oauthRefreshTokens.applicationId, applicationId))
  await useNitroApp().hooks.callHook('oauth:token:revoked', { applicationId, userId: null, reason: 'revoked' })
}

/**
 * Revokes a user's refresh tokens, for one application or all of them. Call it when a user is
 * deactivated or loses a role; already issued access tokens stay valid until they expire.
 */
export async function revokeUserGrants(userId: number, applicationId?: string): Promise<void> {
  const where = applicationId
    ? and(eq(schema.oauthRefreshTokens.userId, userId), eq(schema.oauthRefreshTokens.applicationId, applicationId))
    : eq(schema.oauthRefreshTokens.userId, userId)
  const revoked = await db.update(schema.oauthRefreshTokens).set({ revokedAt: new Date() }).where(where)
    .returning({ applicationId: schema.oauthRefreshTokens.applicationId })
  const hooks = useNitroApp().hooks
  for (const id of new Set(revoked.map(row => row.applicationId))) {
    await hooks.callHook('oauth:token:revoked', { applicationId: id, userId, reason: 'user_grants_revoked' })
  }
  await db.delete(schema.oauthAuthorizationCodes).where(applicationId
    ? and(eq(schema.oauthAuthorizationCodes.userId, userId), eq(schema.oauthAuthorizationCodes.applicationId, applicationId))
    : eq(schema.oauthAuthorizationCodes.userId, userId))
}

/**
 * The active applications a user may sign in to (role check through `oauth:user:roles`), highest
 * priority first. Applications with a `loginUrl` link there, the others to their website.
 */
export async function listUserApplications(userId: number, event?: H3Event): Promise<UserApplicationDto[]> {
  const roles = await resolveUserRoles(userId, event)
  const rows = await db.select().from(schema.oauthApplications)
    .where(eq(schema.oauthApplications.isActive, true))
    .orderBy(desc(schema.oauthApplications.priority), schema.oauthApplications.name)
  return rows
    .filter(row => matchesAllowedRoles(row.allowedRoles, roles))
    .map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      priority: row.priority,
      websiteUrl: row.websiteUrl,
      tags: row.tags,
      loginUrl: row.loginUrl || row.websiteUrl,
    }))
}

/** Counts the refresh tokens still valid per application (admin overview). */
export async function countActiveGrants(applicationIds: string[]): Promise<Record<string, number>> {
  if (!applicationIds.length) return {}
  const rows = await db.select({ applicationId: schema.oauthRefreshTokens.applicationId, revokedAt: schema.oauthRefreshTokens.revokedAt, expiresAt: schema.oauthRefreshTokens.expiresAt })
    .from(schema.oauthRefreshTokens)
    .where(inArray(schema.oauthRefreshTokens.applicationId, applicationIds))
  const now = Date.now()
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.revokedAt && row.expiresAt.getTime() > now) counts[row.applicationId] = (counts[row.applicationId] ?? 0) + 1
  }
  return counts
}
