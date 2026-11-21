/** The owner types the volunteering modules ship. Other modules may add their own (any string). */
export const OWNER_TYPES = ['operation', 'team', 'user', 'platform'] as const

/** Who owns a record: an operation, a team, a user, the platform, or a type another module adds. */
export type OwnerType = typeof OWNER_TYPES[number] | (string & {})

/**
 * A reference to a record's owner, stored as the `ownerType` / `ownerId` columns. `id` is text, and `null` for
 * `platform`, which has a single owner.
 */
export interface OwnerRef {
  type: OwnerType
  id: string | null
}

/** A label in one language, or one per locale code: the same shape as `Translated` in `@frigear-nu/ui`. */
export type OwnerLabel = string | Record<string, string>

/** The lowest team role a viewer must hold, in the ladder of a team kind (e.g. `{ kind: 'bar', role: 'ba' }`). */
export interface MinTeamRole {
  kind: string
  role: string
}

/**
 * Who may see a record. Stored as a JSON column named `visibility`.
 *
 * - Empty (`null`, `undefined` or `{}`): signed-in viewers only.
 * - `public: true`: everyone, including anonymous visitors. The other keys are then ignored.
 * - Otherwise a signed-in viewer who meets every key that is set.
 */
export interface Visibility {
  /** Everyone, including anonymous visitors. */
  public?: boolean
  /** The viewer holds at least one of these global roles. An empty list matches nobody. */
  globalRoles?: string[]
  /** The viewer holds a team role of this kind at or above `role`. With `operationId`, on a team of that operation. */
  minTeamRole?: MinTeamRole
  /** The viewer takes part in this operation. */
  operationId?: string
}

/** A team role a viewer holds, on one team of one owner. */
export interface TeamRoleGrant {
  ownerType: OwnerType
  ownerId: string
  teamId: string
  kind: string
  role: string
  /** `explicit`: a stored membership. `mapped`: resolved at read time from a role mapping rule. */
  source: 'explicit' | 'mapped'
}

/** Everything the visibility rules need to know about the person looking. */
export interface Viewer {
  /** `null` for an anonymous visitor. */
  userId: string | number | null
  /** Global roles from authorization (`admin`, `barmanager`, ...). */
  globalRoles: string[]
  /** Team roles, filled by the teams module. */
  teamRoles: TeamRoleGrant[]
  /** Operations the viewer takes part in, filled by operations and crew. */
  operationIds: string[]
  /** Team kind to its ordered role keys, lowest first (`{ bar: ['volunteer', 'bartender', 'ba', 'coordinator'] }`). */
  ladders: Record<string, string[]>
}
