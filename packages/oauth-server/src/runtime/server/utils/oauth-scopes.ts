import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { apiError, badRequest, conflict, isoDate, notFound, validationError } from '@frigear-nu/module-kit/server'
import { expandScopes, isKnownScope, scopeGrantable, validateNamedScopes } from '@frigear-nu/auth/utils'
import type { AuthUser, NamedScopes, ScopeDefinition } from '@frigear-nu/auth/utils'
import { namedScopes, registry } from '#auth/permissions'
import type { AdminOAuthScopeDto, OAuthApplication, OAuthDbScope, OAuthScopeInput } from '../../../types'
import { OIDC_SCOPES } from '../../utils'

// The scopes this server accepts: the OIDC ones, every permission a token may hold (with aliases and wildcards), the
// named scopes of config and modules (`addScope`, compiled into `#auth/permissions`) and the database scopes staff
// manage (`oauth_scopes`). Which of them a user may give a client is `filterGrantableScopes`.

type ScopeRow = typeof schema.oauthScopes.$inferSelect

const NAME = /^[a-z0-9][a-z0-9._-]*$/

const isOidcScope = (scope: string) => (OIDC_SCOPES as readonly string[]).includes(scope)

export function toOAuthDbScope(row: ScopeRow): OAuthDbScope {
  return { ...row, permissions: row.permissions ?? [] }
}

/** Every database scope, active or not, by name. */
export async function listOAuthDbScopes(): Promise<OAuthDbScope[]> {
  const rows = await db.select().from(schema.oauthScopes).orderBy(schema.oauthScopes.name)
  return rows.map(toOAuthDbScope)
}

/** What a request needs to know about scopes: the named scopes (config, modules and active database ones) and versions. */
export interface OAuthScopeCatalog {
  /** Named scopes by name: config and modules first, then the active database scopes (which cannot shadow them). */
  named: NamedScopes
  /** The version of every active database scope, by name. */
  versions: Record<string, number>
  /** The active database scopes, by name. */
  database: Record<string, OAuthDbScope>
}

declare module 'h3' {
  interface H3EventContext {
    oauthScopeCatalog?: Promise<OAuthScopeCatalog>
  }
}

async function loadCatalog(): Promise<OAuthScopeCatalog> {
  const rows = (await listOAuthDbScopes()).filter(scope => scope.isActive)
  const named: Record<string, ScopeDefinition> = { ...namedScopes }
  const versions: Record<string, number> = {}
  const database: Record<string, OAuthDbScope> = {}
  for (const row of rows) {
    if (Object.hasOwn(named, row.name) || isOidcScope(row.name)) continue
    named[row.name] = { name: row.name, label: row.label ?? undefined, description: row.description ?? undefined, icon: row.icon ?? undefined, permissions: row.permissions, version: row.version }
    versions[row.name] = row.version
    database[row.name] = row
  }
  return { named, versions, database }
}

/** The scope catalog, read once per request. */
export function getOAuthScopeCatalog(event?: H3Event): Promise<OAuthScopeCatalog> {
  if (!event) return loadCatalog()
  return event.context.oauthScopeCatalog ??= loadCatalog()
}

/** Whether this server knows `scope`: an OIDC scope, a permission (alias, wildcard) a token may hold, or a named scope. */
export function isKnownOAuthScope(scope: string, catalog: OAuthScopeCatalog): boolean {
  return isOidcScope(scope) || isKnownScope(scope, registry, catalog.named)
}

/** Every scope name this server advertises (`scopes_supported`): OIDC, named scopes, then the delegable permissions. */
export async function listSupportedOAuthScopes(event?: H3Event): Promise<string[]> {
  const catalog = await getOAuthScopeCatalog(event)
  const permissions = Object.values(registry.permissions).filter(p => !p.sessionOnly).map(p => p.name).sort()
  return [...new Set([...OIDC_SCOPES.filter(scope => scope !== 'offline_access'), ...Object.keys(catalog.named), ...permissions])]
}

export interface ScopeGrantOptions {
  /** The client: whether it may receive wildcard scopes. */
  application: Pick<OAuthApplication, 'wildcardScopes'>
}

/**
 * Splits `scope` into what `user` may give the application and the rest (`unavailable`): a known scope within the
 * user's `roleScopes` cap, a wildcard only for clients with `wildcardScopes`, and every permission it expands to
 * delegable by the user (`canGrantScope`: `authorization:before` and roles, no policies). OIDC scopes only need the cap.
 */
export async function filterGrantableScopes(event: H3Event, user: AuthUser, scope: readonly string[], options: ScopeGrantOptions): Promise<{ granted: string[], unavailable: string[] }> {
  const catalog = await getOAuthScopeCatalog(event)
  const roleScopes = getOAuthRoleScopes()
  const wildcardScopes = options.application.wildcardScopes === true
  let roles: string[] | undefined
  const effectiveRoles = async () => roles ??= roleScopes ? await getEffectiveRoles(event, user) : []

  const granted: string[] = []
  const unavailable: string[] = []
  for (const name of scope) {
    let allowed: boolean
    if (isOidcScope(name)) {
      if (!roleScopes) allowed = true
      else {
        const cap = new Set((await effectiveRoles()).flatMap(role => Object.hasOwn(roleScopes, role) ? roleScopes[role]! : []))
        allowed = cap.has(name) || cap.has('*')
      }
    }
    else if (Object.hasOwn(catalog.database, name)) {
      // `canGrantScope` only knows the compiled named scopes: check the shape here, then every permission.
      allowed = scopeGrantable(name, { registry, namedScopes: catalog.named, canGrant: () => true, roles: await effectiveRoles(), roleScopes: roleScopes ?? undefined, wildcardScopes })
      if (allowed) {
        for (const permission of expandScopes([name], registry, catalog.named)) {
          if (!(await canGrantScope(event, permission, { user }))) {
            allowed = false
            break
          }
        }
      }
    }
    else {
      allowed = await canGrantScope(event, name, { user, wildcardScopes, roleScopes: roleScopes ?? undefined })
    }
    if (allowed) granted.push(name)
    else unavailable.push(name)
  }
  return { granted, unavailable }
}

/**
 * The permissions an access token for `scope` freezes in its `permissions` claim: what the scopes expand to (named
 * scopes, aliases, wildcards) that `user` may delegate now. Sorted.
 */
export async function grantedOAuthPermissions(event: H3Event, user: AuthUser, scope: readonly string[]): Promise<string[]> {
  const catalog = await getOAuthScopeCatalog(event)
  const expanded = expandScopes(scope, registry, catalog.named)
  return expanded.length ? grantedScopePermissions(event, expanded, user) : []
}

/** The versions of the database scopes in `scope`, recorded with a consent. `null` when there are none. */
export async function consentedScopeVersions(event: H3Event, scope: readonly string[]): Promise<Record<string, number> | null> {
  const { versions } = await getOAuthScopeCatalog(event)
  const entries = scope.filter(name => Object.hasOwn(versions, name)).map(name => [name, versions[name]!] as const)
  return entries.length ? Object.fromEntries(entries) : null
}

/** `settings.roleScopes`, or `null` when no cap is configured. */
export function getOAuthRoleScopes(): Readonly<Record<string, readonly string[]>> | null {
  const value = useOAuthConfig().roleScopes as Record<string, string[]> | string | null | undefined
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, string[]>
    }
    catch {
      console.error('[oauth-server] settings.roleScopes is not valid JSON: no role may grant anything.')
      return {}
    }
  }
  return value
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin: database scopes
// ---------------------------------------------------------------------------------------------------------------------

const permissionList = z.array(z.string().trim().min(1).max(128)).min(1).max(100)

export const oauthScopeInputSchema = z.object({
  name: z.string().trim().min(1).max(64).regex(NAME, 'A single lower-case word: letters, digits, ".", "_" or "-".'),
  label: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(500).nullish(),
  icon: z.string().trim().max(120).nullish(),
  permissions: permissionList,
  isActive: z.boolean().optional(),
})

export const oauthScopePatchSchema = oauthScopeInputSchema.omit({ name: true }).partial()

export const oauthScopeNameParams = z.object({ name: z.string().min(1).max(64) })

const managedByConfig = () => apiError(409, 'managed_by_config', 'This scope is defined in nuxt.config (oauthServer.scopes) or by a module: it cannot be changed here.')
const scopeNotFound = () => notFound('Scope not found.')

/** A scope defined in config or by a module (`addScope`), or an OIDC scope: read-only in the admin. */
export function isManagedOAuthScope(name: string): boolean {
  return isOidcScope(name) || Object.hasOwn(namedScopes, name)
}

/**
 * 400 unless `permissions` is a valid scope body: registered permissions by name, never sensitive or `sessionOnly`.
 * Wildcards (`*`, `resource:*`) are refused (`validation_failed`): what they cover grows with every deploy that registers
 * a permission, without bumping the scope's version, so users would never be asked to consent to the wider scope.
 */
function assertScopePermissions(name: string, permissions: string[]) {
  const wildcards = permissions.flatMap((permission, index) => permission === '*' || permission.endsWith(':*')
    ? [{ path: ['permissions', index], message: `"${permission}" is a wildcard: list the permissions by name.` }]
    : [])
  if (wildcards.length) throw validationError(wildcards, 'A database scope cannot contain wildcards.')
  const errors = validateNamedScopes({ [name]: { name, permissions } }, registry)
  if (errors.length) throw badRequest(errors.join(' '))
}

export function toAdminOAuthScopeDto(scope: OAuthDbScope): AdminOAuthScopeDto {
  return {
    name: scope.name,
    label: scope.label,
    description: scope.description,
    icon: scope.icon,
    service: null,
    permissions: scope.permissions,
    version: scope.version,
    isActive: scope.isActive,
    managed: false,
    createdAt: isoDate(scope.createdAt),
    updatedAt: isoDate(scope.updatedAt),
  }
}

/** The read-only scopes of config and modules, for the admin list. */
export function listManagedOAuthScopes(): AdminOAuthScopeDto[] {
  return Object.values(namedScopes).map(scope => ({
    name: scope.name,
    label: scope.label ?? null,
    description: scope.description ?? null,
    icon: scope.icon ?? null,
    service: scope.service ?? null,
    permissions: scope.permissions ?? [],
    version: scope.version ?? 1,
    isActive: true,
    managed: true,
    createdAt: null,
    updatedAt: null,
  }))
}

export async function getOAuthDbScope(name: string): Promise<OAuthDbScope | null> {
  const [row] = await db.select().from(schema.oauthScopes).where(eq(schema.oauthScopes.name, name)).limit(1)
  return row ? toOAuthDbScope(row) : null
}

/** One scope for a staff route (a managed one too), or 404 `not_found`. */
export async function requireOAuthScope(name: string): Promise<AdminOAuthScopeDto> {
  const managed = listManagedOAuthScopes().find(scope => scope.name === name)
  if (managed) return managed
  const scope = await getOAuthDbScope(name)
  if (!scope) throw scopeNotFound()
  return toAdminOAuthScopeDto(scope)
}

export async function createOAuthScope(input: OAuthScopeInput): Promise<OAuthDbScope> {
  if (isManagedOAuthScope(input.name)) throw managedByConfig()
  assertScopePermissions(input.name, input.permissions)
  const [row] = await db.insert(schema.oauthScopes).values({
    name: input.name,
    label: input.label ?? null,
    description: input.description ?? null,
    icon: input.icon ?? null,
    permissions: [...new Set(input.permissions)],
    version: 1,
    isActive: input.isActive ?? true,
  }).onConflictDoNothing({ target: schema.oauthScopes.name }).returning()
  if (!row) throw conflict('A scope with this name exists already.')
  return toOAuthDbScope(row)
}

/**
 * Updates a database scope. When the permissions it expands to grow, its `version` is bumped: users who consented to
 * the old one are asked again (their clients get tokens without it until then).
 */
export async function updateOAuthScope(name: string, patch: Partial<Omit<OAuthScopeInput, 'name'>>): Promise<OAuthDbScope> {
  if (isManagedOAuthScope(name)) throw managedByConfig()
  const existing = await getOAuthDbScope(name)
  if (!existing) throw scopeNotFound()
  let version = existing.version
  let permissions = existing.permissions
  if (patch.permissions) {
    assertScopePermissions(name, patch.permissions)
    permissions = [...new Set(patch.permissions)]
    const before = new Set(expandScopes(existing.permissions, registry))
    if (expandScopes(permissions, registry).some(permission => !before.has(permission))) version += 1
  }
  const [row] = await db.update(schema.oauthScopes).set({
    ...(patch.label !== undefined && { label: patch.label }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.icon !== undefined && { icon: patch.icon }),
    ...(patch.isActive !== undefined && { isActive: patch.isActive }),
    permissions,
    version,
  }).where(eq(schema.oauthScopes.name, name)).returning()
  if (!row) throw scopeNotFound()
  return toOAuthDbScope(row)
}

/** Deletes a database scope: clients asking for it get `invalid_scope`, existing grants lose it at their next refresh. */
export async function deleteOAuthScope(name: string): Promise<void> {
  if (isManagedOAuthScope(name)) throw managedByConfig()
  const deleted = await db.delete(schema.oauthScopes).where(eq(schema.oauthScopes.name, name)).returning({ name: schema.oauthScopes.name })
  if (!deleted.length) throw scopeNotFound()
}
