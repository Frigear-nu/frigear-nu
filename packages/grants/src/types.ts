import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

/**
 * One rule of an audience: `kind` names the grant kind (`public`, `role`, or a kind a module registers), the other keys
 * are the kind's own (`{ kind: 'role', role: 'admin' }`). Each kind validates its keys with its zod schema.
 */
export type Grant = { kind: string } & Record<string, unknown>

/** The grant the `public` kind admits everyone with, anonymous callers included. */
export type PublicGrant = { kind: 'public' }

/** The grant of the `role` kind: callers holding this global role (with inheritance). */
export type RoleGrant = { kind: 'role', role: string }

/** The user a grant is checked for: `null` for an anonymous caller. */
export type GrantUser = { id: string | number }

/** What `matches` gets: one grant, and who asks. */
export interface GrantMatchContext<G extends Grant = Grant> {
  event: H3Event
  /** `null` for an anonymous caller. Only the `public` kind admits one. */
  user: GrantUser | null
  grant: G
}

/** What `members` gets: every grant of this kind in the list, so the kind can answer them in one batch. */
export interface GrantMembersContext<G extends Grant = Grant> {
  event: H3Event
  grants: G[]
}

/** What `validate` gets: one grant that is about to be stored. */
export interface GrantValidateContext<G extends Grant = Grant> {
  event: H3Event
  grant: G
}

/**
 * A grant kind, the default export of the server file a module registers with `extendGrants`.
 *
 * - `schema` validates a grant of this kind (strict, with `kind` as a literal). A grant that fails it admits nobody.
 * - `matches` says whether one user matches one grant. It must not throw for a user it does not know.
 * - `members` lists the users matching any of `grants`, as user ids. Batch the lookups, and keep every query under
 *   D1's 100 bound parameters (`chunkGrantParams`).
 * - `validate` (optional) checks a grant before it is stored, for example that the team it names exists. Return a
 *   message to refuse it.
 */
export interface GrantKindDefinition<G extends Grant = Grant> {
  kind: string
  schema: ZodType<G>
  matches: (ctx: GrantMatchContext<G>) => boolean | Promise<boolean>
  members: (ctx: GrantMembersContext<G>) => Iterable<string | number> | Promise<Iterable<string | number>>
  validate?: (ctx: GrantValidateContext<G>) => string | undefined | Promise<string | undefined>
}

/** A grant kind as a module registers it at build time (`extendGrants`). */
export interface GrantKindRegistration {
  /** The `kind` value of its grants: lower case letters, digits, `-` and `_`. */
  kind: string
  /** Absolute path of the server file whose default export is `defineGrantKind(...)`. */
  server: string
  /** Absolute path of the Vue component that edits one grant (`v-model`). Leave it out for a kind without fields. */
  field?: string
  /** The kind's name in the editor's "Add" menu. */
  label: string
  /** An i18n key for `label`. */
  labelKey?: string
  icon?: string
  /** The keys of a new grant of this kind, besides `kind`. */
  defaults?: Record<string, unknown>
  /** Where it sorts in the "Add" menu (lowest first). Defaults to 100. */
  order?: number
}

/** A kind on the client: what the grant list editor shows. */
export type GrantFieldMeta = Omit<GrantKindRegistration, 'server' | 'field'> & { hasField: boolean }

/** The module has no options: kinds are registered with `extendGrants`. */
export type ModuleOptions = Record<string, never>
