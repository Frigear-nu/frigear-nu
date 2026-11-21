import { z } from 'zod'
import type { MinTeamRole, Viewer, Visibility } from './types.ts'

/** Validates a stored or submitted `visibility` value. Unknown keys are dropped. */
export const visibilitySchema = z.object({
  public: z.boolean().optional(),
  globalRoles: z.array(z.string().min(1)).optional(),
  minTeamRole: z.object({ kind: z.string().min(1), role: z.string().min(1) }).optional(),
  operationId: z.string().min(1).optional(),
})

/** A visibility nobody passes: what {@link narrowVisibility} returns for a combination it cannot express. */
export const NOBODY: Readonly<Visibility> = Object.freeze({ globalRoles: [] })

/**
 * Reads a `visibility` value of unknown shape, such as a JSON column. `null` / `undefined` stay empty (signed-in
 * viewers only). A value that does not match the schema fails closed: it becomes {@link NOBODY}.
 */
export function parseVisibility(value: unknown): Visibility | null {
  if (value === null || value === undefined) return null
  const result = visibilitySchema.safeParse(value)
  return result.success ? result.data : nobody()
}

/** A viewer with nothing filled in. Pass `userId` for a signed-in user. */
export function createViewer(viewer: Partial<Viewer> = {}): Viewer {
  return {
    userId: viewer.userId ?? null,
    globalRoles: viewer.globalRoles ?? [],
    teamRoles: viewer.teamRoles ?? [],
    operationIds: viewer.operationIds ?? [],
    ladders: viewer.ladders ?? {},
  }
}

/**
 * Whether `held` is at or above `min` in `ladder` (ordered lowest first). A role missing from the ladder fails
 * closed.
 */
export function roleAtLeast(ladder: readonly string[], held: string, min: string): boolean {
  const heldIndex = ladder.indexOf(held)
  const minIndex = ladder.indexOf(min)
  if (heldIndex === -1 || minIndex === -1) return false
  return heldIndex >= minIndex
}

/** True when the visibility sets no constraint and is not public: visible to signed-in viewers only. */
export function isEmptyVisibility(visibility: Visibility | null | undefined): boolean {
  if (!visibility) return true
  return visibility.public !== true
    && visibility.globalRoles === undefined
    && visibility.minTeamRole === undefined
    && visibility.operationId === undefined
}

function isSignedIn(viewer: Viewer | null): viewer is Viewer {
  return viewer !== null && viewer.userId !== null && viewer.userId !== undefined
}

/** Whether the viewer takes part in an operation: listed in `operationIds`, or holding a team role on it. */
export function takesPart(viewer: Viewer, operationId: string): boolean {
  return viewer.operationIds.includes(operationId)
    || viewer.teamRoles.some(grant => grant.ownerType === 'operation' && grant.ownerId === operationId)
}

/**
 * Whether the viewer holds a team role of `min.kind` at or above `min.role`. With `operationId`, only grants on a
 * team owned by that operation count. An unknown kind or role fails closed.
 */
export function holdsTeamRole(viewer: Viewer, min: MinTeamRole, operationId?: string): boolean {
  const ladder = viewer.ladders[min.kind]
  if (!ladder) return false
  return viewer.teamRoles.some(grant =>
    grant.kind === min.kind
    && (operationId === undefined || (grant.ownerType === 'operation' && grant.ownerId === operationId))
    && roleAtLeast(ladder, grant.role, min.role),
  )
}

/**
 * Whether `viewer` may see a record with this visibility.
 *
 * - `public: true`: everyone, `null` viewer included.
 * - Anything else needs a signed-in viewer (`userId` set). Empty visibility needs nothing more.
 * - Every key that is set must hold: `globalRoles` (any of them), `minTeamRole` (on the operation when
 *   `operationId` is set) and `operationId` (the viewer takes part).
 */
export function isVisible(visibility: Visibility | null | undefined, viewer: Viewer | null): boolean {
  if (visibility?.public === true) return true
  if (!isSignedIn(viewer)) return false
  if (!visibility) return true

  const { globalRoles, minTeamRole, operationId } = visibility
  if (globalRoles !== undefined && !globalRoles.some(role => viewer.globalRoles.includes(role))) return false
  if (operationId !== undefined && !takesPart(viewer, operationId)) return false
  if (minTeamRole !== undefined && !holdsTeamRole(viewer, minTeamRole, operationId)) return false
  return true
}

function higherRole(a: MinTeamRole, b: MinTeamRole, ladders?: Record<string, readonly string[]>): MinTeamRole | null {
  if (a.kind !== b.kind) return null
  if (a.role === b.role) return { ...a }
  const ladder = ladders?.[a.kind]
  if (!ladder || !ladder.includes(a.role) || !ladder.includes(b.role)) return null
  return roleAtLeast(ladder, a.role, b.role) ? { ...a } : { ...b }
}

function nobody(): Visibility {
  return { globalRoles: [] }
}

function copy(visibility: Visibility | null | undefined): Visibility {
  if (!visibility) return {}
  const out: Visibility = {}
  if (visibility.public === true) out.public = true
  if (visibility.globalRoles !== undefined) out.globalRoles = [...visibility.globalRoles]
  if (visibility.minTeamRole !== undefined) out.minTeamRole = { ...visibility.minTeamRole }
  if (visibility.operationId !== undefined) out.operationId = visibility.operationId
  return out
}

/**
 * The visibility of an item inside a group (an FAQ item in its group, an article in its category). The item can
 * only narrow the group: the result is the group's visibility AND the item's.
 *
 * - An empty item inherits the group.
 * - A public group takes the item's visibility as it is.
 * - A public item inside a restricted group stays restricted: it gets the group's visibility.
 * - Otherwise each key combines: `globalRoles` intersect, `operationId` must match, and `minTeamRole` takes the
 *   higher role of the same kind (through `ladders`).
 * - A combination one visibility cannot express (two operations, two team kinds, roles missing from the ladder)
 *   fails closed: {@link NOBODY}.
 */
export function narrowVisibility(
  parent: Visibility | null | undefined,
  child: Visibility | null | undefined,
  ladders?: Record<string, readonly string[]>,
): Visibility {
  if (isEmptyVisibility(child)) return copy(parent)
  if (parent?.public === true) return copy(child)
  if (child?.public === true) return copy(parent)

  const a = copy(parent)
  const b = copy(child)
  const out: Visibility = {}

  if (a.globalRoles !== undefined && b.globalRoles !== undefined) {
    out.globalRoles = a.globalRoles.filter(role => b.globalRoles!.includes(role))
  }
  else if (a.globalRoles !== undefined || b.globalRoles !== undefined) {
    out.globalRoles = a.globalRoles ?? b.globalRoles
  }

  if (a.operationId !== undefined && b.operationId !== undefined && a.operationId !== b.operationId) {
    return nobody()
  }
  const operationId = a.operationId ?? b.operationId
  if (operationId !== undefined) out.operationId = operationId

  if (a.minTeamRole && b.minTeamRole) {
    const role = higherRole(a.minTeamRole, b.minTeamRole, ladders)
    if (!role) return nobody()
    out.minTeamRole = role
  }
  else if (a.minTeamRole || b.minTeamRole) {
    out.minTeamRole = a.minTeamRole ?? b.minTeamRole
  }

  return out
}

/**
 * Whether `child` is at least as strict as `parent`, key by key: everyone who passes `child` also passes `parent`.
 * An empty `child` inherits `parent`, so it counts as equal; a public `child` under a restricted `parent` does not.
 * Use it to warn an editor that an item's visibility would widen its group. It is a structural check, so it can
 * answer `false` for a combination that happens to be narrower. Without `ladders` a team role must match exactly.
 */
export function isNarrowerOrEqual(
  parent: Visibility | null | undefined,
  child: Visibility | null | undefined,
  ladders?: Record<string, readonly string[]>,
): boolean {
  if (parent?.public === true) return true
  if (child?.public === true) return false
  if (isEmptyVisibility(parent) || isEmptyVisibility(child)) return true
  const p = parent!
  const c = child!

  if (p.globalRoles !== undefined) {
    if (c.globalRoles === undefined || !c.globalRoles.every(role => p.globalRoles!.includes(role))) return false
  }
  if (p.operationId !== undefined && c.operationId !== p.operationId) return false
  if (p.minTeamRole !== undefined) {
    const min = c.minTeamRole
    if (!min || min.kind !== p.minTeamRole.kind) return false
    if (min.role !== p.minTeamRole.role) {
      const ladder = ladders?.[min.kind]
      if (!ladder || !roleAtLeast(ladder, min.role, p.minTeamRole.role)) return false
    }
  }
  return true
}
