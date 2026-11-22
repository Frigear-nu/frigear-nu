import type { H3Event } from 'h3'
import { validationError } from '@frigear-nu/module-kit/server'
import { kinds } from '#auth/grant-kinds'
import {
  checkGrantList,
  createGrantRegistry,
  grantListShape,
  hasPublicGrant,
  listGrantMembers,
  matchGrantList,
  parseGrant,
  readGrants,
} from '../../utils/grants'
import type { Grant, GrantRegistry, GrantUser } from '../../utils/grants'
import { allows } from './access'

// Grant lists on the server: who may see a record. Any one grant admits; the empty list admits nobody; a grant of an
// unknown kind, or one its kind's schema refuses, admits nobody. Kinds come from `extendGrants`: `public` is built in,
// `@frigear-nu/authorization` adds `role`, and other modules add theirs.

let registry: GrantRegistry | undefined

/** Every registered grant kind, by name (`public` and the kinds modules add with `extendGrants`). */
export function grantsRegistry(): GrantRegistry {
  return registry ??= createGrantRegistry(kinds)
}

/** Reads a stored grant list (see `readGrants`): not an array is the empty list, which admits nobody. */
export const grantsRead = (value: unknown): Grant[] => readGrants(value)

/** Whether the list holds a valid `public` grant (parsed through the registry: an invalid one admits nobody). */
export const grantsArePublic = (value: unknown): boolean => hasPublicGrant(value, grantsRegistry())

/**
 * Whether `user` (`null` when anonymous) matches the list: ANY one grant admits; the empty list admits nobody; an
 * unknown kind or an invalid grant admits nobody. Use it in the policy of a read permission, and for another user than
 * the caller (a send). For the caller of a request, use `grantsCanRead`.
 */
export function grantsMatch(event: H3Event, user: GrantUser | null, value: unknown): Promise<boolean> {
  return matchGrantList(grantsRegistry(), event, user, value)
}

/** The ids (as text) of the users matching the list: the union of each kind's `members`. */
export function grantsMembers(event: H3Event, value: unknown): Promise<string[]> {
  return listGrantMembers(grantsRegistry(), event, value)
}

/**
 * Whether the caller may read `record`: a record whose `grants` hold a valid `public` grant is served to everyone, signed in
 * or not. Every other record goes through `allows(event, permission, record)`, so the permission's roles, token scopes,
 * `authorization:before` and the module's policy (which evaluates the grants with `grantsMatch`) decide. Anonymous
 * callers are only ever admitted by a `public` grant. This is the one place that exception lives: call it, do not
 * re-implement it.
 */
export async function grantsCanRead(event: H3Event, permission: Parameters<typeof allows>[1], record: { grants: unknown }): Promise<boolean> {
  if (hasPublicGrant(record.grants, grantsRegistry())) return true
  return allows(event, permission, record)
}

/**
 * The zod schema of a submitted grant list: an array of `{ kind, ... }` objects, each of a registered kind and valid by
 * its schema. Use it in request bodies (`grants: grantsListSchema()`).
 */
export function grantsListSchema() {
  return grantListShape.superRefine((grants, ctx) => {
    for (const issue of checkGrantList(grantsRegistry(), grants as Grant[])) {
      ctx.addIssue({ code: 'custom', path: [issue.index], message: issue.message })
    }
  }).transform(grants => (grants as Grant[]).map(grant => parseGrant(grantsRegistry(), grant)!))
}

/**
 * Checks a submitted list (already in the shape of `grantListShape`) and returns it as stored: 400 when a grant is of an
 * unknown kind, fails its kind's schema, or fails its kind's `validate` (a team or an operation that does not exist).
 * Grants already in `stored` skip `validate`, so a record whose team was deleted can still be edited. `field` is the body
 * key the list came in (`grants`). Request schemas keep to the shape (`grantListShape` of `@frigear-nu/auth/grants`)
 * so they stay testable without Nitro; the handler calls this.
 */
export async function grantsValidate(event: H3Event, value: readonly Grant[], options: { stored?: unknown, field?: string } = {}): Promise<Grant[]> {
  const field = options.field ?? 'grants'
  const shapeIssues = checkGrantList(grantsRegistry(), value)
  if (shapeIssues.length) throw validationError(shapeIssues.map(issue => ({ path: [field, issue.index], message: issue.message })), 'Invalid grants')
  const grants = value.map(grant => parseGrant(grantsRegistry(), grant)!)
  const stored = new Set(readGrants(options.stored).map(grant => JSON.stringify(grant)))
  const issues: Array<{ path: (string | number)[], message: string }> = []
  for (const [index, grant] of grants.entries()) {
    if (stored.has(JSON.stringify(grant))) continue
    const kind = grantsRegistry().get(grant.kind)
    if (!kind?.validate) continue
    const message = await kind.validate({ event, grant })
    if (message) issues.push({ path: [field, index], message })
  }
  if (issues.length) throw validationError(issues, 'Invalid grants')
  return grants
}
