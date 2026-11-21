import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { validationError } from '@frigear-nu/module-kit/server'
import type { TeamLadder, TeamLadderDto } from '../../../types'
import { DEFAULT_TEAM_LADDERS, ladderKeys } from '../../utils/ladders'

const ladderCache = new WeakMap<H3Event, Promise<Record<string, TeamLadderDto>>>()

/** The ladders of the module option `ladders` (merged over the default `bar` ladder in `module.ts`). */
export function teamsLadderOption(): Record<string, TeamLadder> {
  const config = useRuntimeConfig() as unknown as { teams?: { ladders?: Record<string, TeamLadder> } }
  return config.teams?.ladders ?? { ...DEFAULT_TEAM_LADDERS }
}

/**
 * Every ladder by team kind: the stored rows of `team_role_ladders`, and the module option's ladders for the kinds
 * that have no row yet (`source: 'default'`). Cached per request when `event` is given.
 */
export function loadTeamLadders(event?: H3Event): Promise<Record<string, TeamLadderDto>> {
  const cached = event && ladderCache.get(event)
  if (cached) return cached
  const promise = (async () => {
    const result: Record<string, TeamLadderDto> = {}
    for (const [kind, ladder] of Object.entries(teamsLadderOption())) {
      result[kind] = { kind, roles: ladder.roles, leadFrom: ladder.leadFrom ?? null, source: 'default' }
    }
    for (const row of await db.select().from(schema.teamRoleLadders)) {
      result[row.kind] = { kind: row.kind, roles: row.roles, leadFrom: row.leadFrom ?? null, source: 'stored' }
    }
    return result
  })()
  if (event) ladderCache.set(event, promise)
  return promise
}

/** Forgets the ladders cached for this request, after one was edited. */
export function forgetTeamLadders(event: H3Event): void {
  ladderCache.delete(event)
}

/** Team kind to its ordered role keys, lowest first: the shape of `viewer.ladders`. */
export function teamLadderKeyMap(ladders: Record<string, TeamLadderDto>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(ladders).map(([kind, ladder]) => [kind, ladderKeys(ladder)]))
}

/** The ladder of `kind`, or a 400 on `field` when no ladder exists for it. */
export async function getTeamLadderOr400(event: H3Event, kind: string, field = 'kind'): Promise<TeamLadderDto> {
  const ladder = (await loadTeamLadders(event))[kind]
  if (!ladder) throw validationError([{ path: [field], message: `There is no ladder for the team kind "${kind}".` }], 'Unknown team kind')
  return ladder
}

/** 400 on `field` when `role` is not on the ladder of `kind`. */
export async function assertTeamRoleOnLadder(event: H3Event, kind: string, role: string, field = 'role'): Promise<void> {
  const ladder = await getTeamLadderOr400(event, kind, field)
  if (!ladderKeys(ladder).includes(role)) {
    throw validationError([{ path: [field], message: `"${role}" is not a role of the ${kind} ladder.` }], 'Unknown team role')
  }
}

let seeding: Promise<void> | undefined

/**
 * Stores the option's ladders whose kind has no row yet, once per server (insert-if-missing: an edited row is never
 * replaced). Runs on the first request, after NuxtHub applied the migrations; a failure is retried on the next one.
 */
export function ensureTeamLaddersSeeded(): Promise<void> {
  seeding ??= (async () => {
    for (const [kind, ladder] of Object.entries(teamsLadderOption())) {
      await db.insert(schema.teamRoleLadders).values({ kind, roles: ladder.roles, leadFrom: ladder.leadFrom ?? null }).onConflictDoNothing()
    }
  })().catch((error: unknown) => {
    seeding = undefined
    console.error('[teams] the default ladders could not be stored; retried on the next request', error)
  })
  return seeding
}
