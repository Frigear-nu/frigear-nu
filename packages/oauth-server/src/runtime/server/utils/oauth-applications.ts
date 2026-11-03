import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import type { H3Event } from 'h3'
import { apiError, badRequest, isoDate, notFound } from '@frigear-nu/module-kit/server'
import type { AdminApplicationDto, ApplicationInput, ClientType, OAuthApplication, OAuthNormalizedClient, UserApplicationDto } from '../../../types'
import { CLIENT_TYPES, isNativeRedirectUri, isSecureOrigin, matchesAllowedRoles, newId, normalizeWebsiteUrl } from '../../utils'

type ApplicationRow = typeof schema.oauthApplications.$inferSelect

const applicationNotFound = () => notFound('Application not found.')

const httpsUrl = z.string().trim().max(2048).refine((value) => {
  try {
    return isSecureOrigin(new URL(value))
  }
  catch {
    return false
  }
}, 'Must be a https URL (http is only allowed for localhost).')

/** An https URL (http only for localhost) or a native app URI. Whether native ones are allowed depends on the client type. */
const redirectUri = z.string().trim().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return !url.hash && (isSecureOrigin(url) || isNativeRedirectUri(url))
  }
  catch {
    return false
  }
}, 'Must be a https URL (http is only allowed for localhost) or, for public clients, a custom-scheme URI.')

const names = z.array(z.string().trim().min(1).max(64)).max(50)

/** Validation shared by the admin API and `createApplication` / `updateApplication`. */
export const applicationInputSchema = z.object({
  clientType: z.enum(CLIENT_TYPES).optional(),
  name: z.string().trim().min(1).max(120),
  websiteUrl: z.string().trim().max(2048).nullish(),
  description: z.string().trim().max(1000).nullish(),
  icon: z.string().trim().max(120).nullish(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  loginUrl: httpsUrl.nullish(),
  previewUrlPattern: z.string().trim().max(2048).startsWith('https://').nullish(),
  redirectUris: z.array(redirectUri).max(20).optional(),
  allowedRoles: names.optional(),
  tags: names.optional(),
  isActive: z.boolean().optional(),
  isListed: z.boolean().optional(),
})

export const applicationPatchSchema = applicationInputSchema.partial()

export function toApplication(row: ApplicationRow): OAuthApplication {
  const { secretHash: _secretHash, ...application } = row
  // No website is stored as '' (see `websiteUrl` in the schema).
  return { ...application, websiteUrl: application.websiteUrl || null }
}

/**
 * The redirect URI an application has to accept on its side: its website plus the configured callback path. `null`
 * without a website: such a public client only uses its listed redirect URIs.
 */
export function applicationCallbackUrl(application: Pick<OAuthApplication, 'websiteUrl'>): string | null {
  return application.websiteUrl ? `${application.websiteUrl}${useOAuthConfig().callbackPath}` : null
}

/** The admin view of an application (never the secret hash), with the active sign-ins when counted. */
export function toAdminApplicationDto(application: OAuthApplication, activeGrants?: number): AdminApplicationDto {
  return {
    id: application.id,
    clientType: application.clientType,
    name: application.name,
    description: application.description,
    icon: application.icon,
    priority: application.priority,
    websiteUrl: application.websiteUrl,
    loginUrl: application.loginUrl,
    previewUrlPattern: application.previewUrlPattern,
    redirectUris: application.redirectUris,
    allowedRoles: application.allowedRoles,
    tags: application.tags,
    ownerId: application.ownerId,
    isActive: application.isActive,
    isListed: application.isListed,
    createdAt: isoDate(application.createdAt),
    updatedAt: isoDate(application.updatedAt),
    ...(activeGrants === undefined ? {} : { activeGrants }),
    callbackUrl: applicationCallbackUrl(application),
    managed: isOAuthManagedApplication(application),
  }
}

/** One application for a staff route, or 404 `not_found`. */
export async function requireApplication(id: string): Promise<OAuthApplication> {
  const application = await getApplication(id)
  if (!application) throw applicationNotFound()
  return application
}

function normalizeInput<T extends Partial<ApplicationInput>>(input: T): T {
  const next = { ...input }
  // Leaving the website out is stored as '' (see the schema).
  if (next.websiteUrl === null || next.websiteUrl === '') next.websiteUrl = ''
  else if (next.websiteUrl !== undefined) {
    try {
      next.websiteUrl = normalizeWebsiteUrl(next.websiteUrl)
    }
    catch (error) {
      throw badRequest((error as Error).message)
    }
  }
  if (next.redirectUris) next.redirectUris = [...new Set(next.redirectUris)]
  if (next.allowedRoles) next.allowedRoles = [...new Set(next.allowedRoles)].sort()
  if (next.tags) next.tags = [...new Set(next.tags)]
  return next
}

/** Native redirect URIs are for public clients only: a confidential client keeps to https (and localhost). */
function assertRedirectUris(uris: readonly string[] | undefined, clientType: ClientType) {
  if (clientType === 'public' || !uris) return
  if (uris.some(uri => !isSecureOrigin(new URL(uri)))) throw badRequest('Only public clients may use custom-scheme redirect URIs.')
}

/**
 * A confidential client needs a website: its secret is for a server, and the callback is derived from the website. A
 * public client without one (a native app) needs at least one redirect URI to sign in with.
 */
function assertWebsite(websiteUrl: string | null | undefined, redirectUris: readonly string[] | undefined, clientType: ClientType) {
  if (websiteUrl) return
  if (clientType === 'confidential') throw badRequest('A confidential client needs a website URL.')
  if (!redirectUris?.length) throw badRequest('A public client without a website URL needs at least one redirect URI.')
}

/** The fields of a configured client that come from config: staff cannot change them (409 `managed_by_config`). */
const CONFIG_OWNED = ['name', 'description', 'icon', 'websiteUrl', 'redirectUris', 'allowedRoles', 'tags', 'previewUrlPattern', 'isListed'] as const

const managedByConfig = () => apiError(409, 'managed_by_config', 'This application is managed in nuxt.config (oauthServer.clients).')

// '' and `null` are both "none" (a missing website is stored as '').
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a === '' ? null : a ?? null) === JSON.stringify(b === '' ? null : b ?? null)

/** The config values a configured client's row should have. */
function configuredValues(client: OAuthNormalizedClient) {
  return {
    name: client.name,
    description: client.description,
    icon: client.icon,
    websiteUrl: client.websiteUrl ?? '',
    isListed: client.isListed,
    redirectUris: client.redirectUris,
    allowedRoles: client.allowedRoles,
    tags: client.tags,
    previewUrlPattern: null,
  } satisfies Partial<ApplicationRow>
}

/** Whether config owns the application: its id is in `oauthServer.clients` and its row is a public client. */
export function isOAuthManagedApplication(application: Pick<OAuthApplication, 'id' | 'clientType'>): boolean {
  return application.clientType === 'public' && isOAuthConfiguredClient(application.id)
}

/**
 * A row as this server instance's config says it is: for a managed application the config-owned fields come from
 * `oauthServer.clients`, whatever the database holds (another deploy, a preview or `nuxt dev` on the same database may
 * have written other values). Staff-owned fields (`isActive`, `priority`, `loginUrl`) stay the row's.
 */
export function withOAuthConfiguredValues<T extends ApplicationRow | OAuthApplication>(row: T): T {
  if (row.clientType !== 'public') return row
  const client = findOAuthConfiguredClient(row.id)
  if (!client) return row
  const values = configuredValues(client)
  // A row keeps the stored form ('' for no website); an application the `null` it reads as.
  return { ...row, ...values, websiteUrl: 'secretHash' in row ? values.websiteUrl : values.websiteUrl || null }
}

let ensured: Promise<void> | undefined
let warnedRemoved = false

async function syncConfiguredApplications(): Promise<void> {
  const clients = getOAuthConfiguredClients()
  const table = schema.oauthApplications
  for (const client of clients) {
    // Only creates the row: what it holds afterwards does not matter, reads overlay the config (see
    // `withOAuthConfiguredValues`), so instances with different config never overwrite each other.
    // Active when created; from then on `isActive` belongs to staff.
    const inserted = await db.insert(table).values({
      id: client.id,
      clientType: 'public',
      ownerId: null,
      ...configuredValues(client),
      isActive: true,
      // A public client has no secret to hash; see `secretHash` in the schema.
      secretHash: await sha256Hex(generateSecret()),
    }).onConflictDoNothing({ target: table.id }).returning({ id: table.id })
    if (inserted.length) continue

    const [row] = await db.select({ clientType: table.clientType }).from(table).where(eq(table.id, client.id)).limit(1)
    if (row && row.clientType !== 'public') {
      // Turning a confidential client public would drop its secret: config is ignored for it instead.
      excludeOAuthConfiguredClient(client.id)
      console.warn(`[oauth-server] oauthServer.clients: "${client.id}" is the id of a ${row.clientType} application, so the configured client is ignored (not managed, no CORS origins). Use another id, or delete that application and restart.`)
    }
  }

  if (!warnedRemoved) {
    warnedRemoved = true
    // Created applications always have an `app_` id, so anything else was configured once.
    const rows = await db.select({ id: table.id }).from(table)
    const removed = rows.map(row => row.id).filter(id => !id.startsWith('app_') && !clients.some(client => client.id === id))
    if (removed.length) {
      console.warn(`[oauth-server] Applications ${removed.map(id => `"${id}"`).join(', ')} are no longer in oauthServer.clients. They are kept (with their sign-ins); delete them in the admin UI if they should go.`)
    }
  }
}

/**
 * Creates the missing applications of `oauthServer.clients`, once per server instance (a failure is retried on the next
 * call). Every application lookup awaits it.
 */
export function ensureOAuthConfiguredApplications(): Promise<void> {
  ensured ??= syncConfiguredApplications().catch((error) => {
    ensured = undefined
    throw error
  })
  return ensured
}

/** The row including `secretHash`; only for credential checks. Use `getApplication` everywhere else. */
export async function getApplicationRow(id: string): Promise<ApplicationRow | null> {
  await ensureOAuthConfiguredApplications()
  const [row] = await db.select().from(schema.oauthApplications).where(eq(schema.oauthApplications.id, id)).limit(1)
  return row ? withOAuthConfiguredValues(row) : null
}

export async function getApplication(id: string): Promise<OAuthApplication | null> {
  const row = await getApplicationRow(id)
  return row ? toApplication(row) : null
}

/**
 * Creates an application. The returned `secret` is the only time the plain secret is available; it is `null` for
 * `public` clients, which have none.
 */
export async function createApplication(input: ApplicationInput, ownerId?: number | null): Promise<{ application: OAuthApplication, secret: string | null }> {
  const data = normalizeInput(applicationInputSchema.parse(input))
  const clientType = data.clientType ?? 'confidential'
  assertRedirectUris(data.redirectUris, clientType)
  assertWebsite(data.websiteUrl, data.redirectUris, clientType)
  const secret = clientType === 'public' ? null : generateSecret()
  const [row] = await db.insert(schema.oauthApplications).values({
    id: newId('app'),
    ownerId: ownerId ?? null,
    ...data,
    websiteUrl: data.websiteUrl ?? '',
    clientType,
    // A public client has no secret to hash; see `secretHash` in the schema.
    secretHash: await sha256Hex(secret ?? generateSecret()),
  }).returning()
  return { application: toApplication(row!), secret }
}

/**
 * Updates an application. On a configured client (`oauthServer.clients`) only `isActive`, `priority` and `loginUrl` can
 * change: a different value for a config-owned field is 409 `managed_by_config` (sending the current value is fine).
 */
export async function updateApplication(id: string, patch: Partial<ApplicationInput>): Promise<OAuthApplication> {
  const parsed = applicationPatchSchema.parse(patch)
  const existing = await getApplicationRow(id)
  if (!existing) throw applicationNotFound()
  let input: Partial<ApplicationInput> = parsed
  if (isOAuthManagedApplication(existing)) {
    if (CONFIG_OWNED.some(key => parsed[key] !== undefined && !sameValue(parsed[key], existing[key]))) throw managedByConfig()
    input = Object.fromEntries(Object.entries(parsed).filter(([key]) => !(CONFIG_OWNED as readonly string[]).includes(key)))
  }
  const { clientType, ...data } = normalizeInput(input)
  // A secret cannot be created or dropped by editing: register a new application instead.
  if (clientType && clientType !== existing.clientType) throw badRequest('The client type cannot be changed.')
  assertRedirectUris(data.redirectUris, existing.clientType)
  if (data.websiteUrl !== undefined || data.redirectUris) {
    assertWebsite(data.websiteUrl ?? existing.websiteUrl, data.redirectUris ?? existing.redirectUris, existing.clientType)
  }

  if (!Object.keys(data).length) return toApplication(existing)
  const [row] = await db.update(schema.oauthApplications).set(data).where(eq(schema.oauthApplications.id, id)).returning()
  return toApplication(row ? withOAuthConfiguredValues(row) : existing)
}

/**
 * Deletes the application with its authorization codes and refresh tokens. A configured client is 409
 * `managed_by_config`: remove it from `oauthServer.clients` first (or disable it).
 */
export async function deleteApplication(id: string): Promise<void> {
  const existing = await getApplicationRow(id)
  if (existing && isOAuthManagedApplication(existing)) throw managedByConfig()
  await db.delete(schema.oauthRefreshTokens).where(eq(schema.oauthRefreshTokens.applicationId, id))
  await db.delete(schema.oauthAuthorizationCodes).where(eq(schema.oauthAuthorizationCodes.applicationId, id))
  const deleted = await db.delete(schema.oauthApplications).where(eq(schema.oauthApplications.id, id)).returning({ id: schema.oauthApplications.id })
  if (!deleted.length) throw applicationNotFound()
}

/** Replaces the client secret and revokes the refresh tokens issued with the old one. */
export async function rotateApplicationSecret(id: string): Promise<{ secret: string }> {
  const existing = await getApplicationRow(id)
  if (existing?.clientType === 'public') throw badRequest('Public clients have no client secret.')
  const secret = generateSecret()
  const updated = await db.update(schema.oauthApplications)
    .set({ secretHash: await sha256Hex(secret) })
    .where(eq(schema.oauthApplications.id, id))
    .returning({ id: schema.oauthApplications.id })
  if (!updated.length) throw applicationNotFound()
  await revokeApplicationGrants(id)
  return { secret }
}

export async function verifyApplicationSecret(row: ApplicationRow, secret: string): Promise<boolean> {
  return safeEqual(await sha256Hex(secret), row.secretHash)
}

/**
 * Authenticates the client of a token or revocation request. Confidential clients must present their secret. Public
 * clients are identified by `client_id` alone (their security is PKCE plus refresh token rotation); a secret sent to one
 * is refused, as it can only mean the app was configured with the wrong kind of client.
 */
export async function authenticateClient(event: H3Event, body: Record<string, unknown> | undefined): Promise<{ row: ApplicationRow } | { basic: boolean }> {
  const auth = readClientAuth(event, body)
  const row = auth ? await getApplicationRow(auth.clientId) : null
  const basic = auth?.basic ?? false
  if (!auth || !row) return { basic }

  if (row.clientType === 'public') return auth.clientSecret ? { basic } : { row }
  if (!auth.clientSecret || !(await verifyApplicationSecret(row, auth.clientSecret))) return { basic }
  return { row }
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
 * The active, listed applications a user may sign in to (role check through `oauth:user:roles`), highest
 * priority first. Applications with a `loginUrl` link there, the others to their website. An application without a
 * web link (a native app without a website) is left out: there is nothing to open. Unlisted ones (`isListed: false`)
 * still sign in, users just open them themselves.
 */
export async function listUserApplications(userId: number, event?: H3Event): Promise<UserApplicationDto[]> {
  await ensureOAuthConfiguredApplications()
  const roles = await resolveUserRoles(userId, event)
  const rows = await db.select().from(schema.oauthApplications)
    .where(eq(schema.oauthApplications.isActive, true))
    .orderBy(desc(schema.oauthApplications.priority), schema.oauthApplications.name)
  return rows
    .map(row => withOAuthConfiguredValues(row))
    .filter(row => row.isListed && matchesAllowedRoles(row.allowedRoles, roles))
    .filter(row => /^https?:\/\//i.test(row.loginUrl || row.websiteUrl))
    .map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      priority: row.priority,
      websiteUrl: row.websiteUrl || null,
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
