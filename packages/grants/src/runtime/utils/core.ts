// Framework-free core of the grants registry, safe to import from server code, the Vue app and tests.
import { z } from 'zod'
import type { ZodType } from 'zod'
import type { H3Event } from 'h3'
import type { Grant, GrantKindDefinition, GrantUser } from '../../types'

export type { Grant, GrantKindDefinition, GrantMatchContext, GrantMembersContext, GrantUser, GrantValidateContext, PublicGrant, RoleGrant } from '../../types'

/** The kind that admits everyone, anonymous callers included. */
export const PUBLIC_GRANT_KIND = 'public'

/** The most grants one list may hold. */
export const MAX_GRANTS = 50

/**
 * The most values a kind puts in one `IN (...)` list. D1 allows 100 bound parameters per query; the rest of a query
 * needs a few, so lists are cut at 90.
 */
export const GRANT_PARAM_CHUNK = 90

/** A grant kind name: lower case letters, digits, `-` and `_`. */
export const GRANT_KIND_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

/** Defines a grant kind: the default export of the server file registered with `extendGrants`. */
export function defineGrantKind<G extends Grant>(
  kind: string,
  definition: Omit<GrantKindDefinition<G>, 'kind'> & { schema: ZodType<G> },
): GrantKindDefinition<G> {
  if (!GRANT_KIND_PATTERN.test(kind)) throw new Error(`[grants] "${kind}" is not a valid grant kind name.`)
  return { ...definition, kind }
}

/** Splits `values` into lists short enough for one query each (see {@link GRANT_PARAM_CHUNK}). */
export function chunkGrantParams<T>(values: readonly T[], size = GRANT_PARAM_CHUNK): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

const isGrantShape = (value: unknown): value is Grant =>
  !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { kind?: unknown }).kind === 'string'

/**
 * Reads a stored grant list (a JSON column). Anything that is not an array is the empty list, which admits nobody;
 * entries that are not `{ kind: string, ... }` objects are dropped. Entries of an unknown kind or with invalid keys are
 * kept, so an editor still shows them, but they admit nobody.
 */
export function readGrants(value: unknown): Grant[] {
  if (!Array.isArray(value)) return []
  return value.filter(isGrantShape).map(grant => ({ ...grant }))
}

/** Whether the list holds a `public` grant: the record is served to everyone, without sign-in. */
export function hasPublicGrant(value: unknown): boolean {
  return readGrants(value).some(grant => grant.kind === PUBLIC_GRANT_KIND)
}

/** A registry of grant kinds by name. */
export type GrantRegistry = ReadonlyMap<string, GrantKindDefinition>

/** Builds a registry from kind definitions. A kind registered twice keeps the last definition. */
export function createGrantRegistry(kinds: Iterable<GrantKindDefinition>): GrantRegistry {
  const registry = new Map<string, GrantKindDefinition>()
  for (const kind of kinds) registry.set(kind.kind, kind)
  return registry
}

/** The grant parsed by its kind's schema, or `null` when the kind is unknown or the grant is invalid (fail closed). */
export function parseGrant(registry: GrantRegistry, grant: Grant): Grant | null {
  const kind = registry.get(grant.kind)
  if (!kind) return null
  const result = kind.schema.safeParse(grant)
  return result.success ? result.data : null
}

/**
 * Whether `user` matches the list: ANY one grant admits. The empty list admits nobody. A grant of an unknown kind, an
 * invalid grant, and a kind whose `matches` throws admit nobody.
 */
export async function matchGrantList(registry: GrantRegistry, event: H3Event, user: GrantUser | null, value: unknown): Promise<boolean> {
  for (const raw of readGrants(value)) {
    const grant = parseGrant(registry, raw)
    if (!grant) continue
    if (!user && grant.kind !== PUBLIC_GRANT_KIND) continue
    try {
      if (await registry.get(grant.kind)!.matches({ event, user, grant })) return true
    }
    catch (error) {
      console.error(`[grants] the "${grant.kind}" kind failed to match a grant; it admits nobody`, error)
    }
  }
  return false
}

/**
 * The ids (as text) of the users the list stands for: the union of each kind's `members`, one call per kind with all of
 * its grants. Unknown and invalid grants, and a kind whose `members` throws, add nobody.
 */
export async function listGrantMembers(registry: GrantRegistry, event: H3Event, value: unknown): Promise<string[]> {
  const byKind = new Map<string, Grant[]>()
  for (const raw of readGrants(value)) {
    const grant = parseGrant(registry, raw)
    if (!grant) continue
    const list = byKind.get(grant.kind) ?? []
    list.push(grant)
    byKind.set(grant.kind, list)
  }
  const ids = new Set<string>()
  for (const [name, grants] of byKind) {
    try {
      for (const id of await registry.get(name)!.members({ event, grants })) ids.add(String(id))
    }
    catch (error) {
      console.error(`[grants] the "${name}" kind failed to list its members; it adds nobody`, error)
    }
  }
  return [...ids].sort()
}

/** One problem with a submitted grant list, with the index of the grant it is about. */
export type GrantIssue = { index: number, message: string }

/** Checks a submitted list against the registry: every grant must be of a known kind and pass its schema. */
export function checkGrantList(registry: GrantRegistry, grants: readonly Grant[]): GrantIssue[] {
  const issues: GrantIssue[] = []
  grants.forEach((grant, index) => {
    const kind = registry.get(grant.kind)
    if (!kind) issues.push({ index, message: `Unknown grant kind "${grant.kind}".` })
    else if (!kind.schema.safeParse(grant).success) issues.push({ index, message: `This "${grant.kind}" grant is not valid.` })
  })
  return issues
}

/** The shape of a submitted grant list, before each grant is checked against its kind. */
export const grantListShape = z.array(z.looseObject({ kind: z.string().regex(GRANT_KIND_PATTERN) })).max(MAX_GRANTS)

/** The built-in `public` grant. */
export const publicGrantSchema = z.strictObject({ kind: z.literal('public') })

/** The built-in `role` grant. */
export const roleGrantSchema = z.strictObject({ kind: z.literal('role'), role: z.string().trim().min(1).max(64) })
