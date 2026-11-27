import type { H3Event } from 'h3'
import { isoDate, notFound } from '@frigear-nu/module-kit/server'
import { translate } from '@frigear-nu/ui/translated'
import type { FrigearIdVerification } from '#shared/types/frigear-id'

/** Operation statuses after which a crew place no longer counts on a Frigear ID. */
const OVER_STATUSES = new Set(['wrapped_up', 'archived'])

/** The effective global roles of a user, highest first (most inherited roles), without the default roles (`user`). */
async function frigearIdRoles(event: H3Event, user: Parameters<typeof getEffectiveRoles>[1]): Promise<FrigearIdVerification['roles']> {
  const { table } = useAuthorizationAccessTables()
  const order = Object.keys(table.roles)
  const roles = (await getEffectiveRoles(event, user)).flatMap((key) => {
    const role = table.roles[key]
    return role && !role.default ? [{ key, label: role.label || key, rank: role.inherited.length }] : []
  })
  return roles
    .sort((a, b) => b.rank - a.rank || order.indexOf(a.key) - order.indexOf(b.key))
    .map(({ key, label }) => ({ key, label }))
}

/** The entitled subscription, or the latest one when none is, with the plan's configured label. */
async function frigearIdMembership(event: H3Event, userId: number): Promise<FrigearIdVerification['membership']> {
  const entitled = await getUserSubscription(userId)
  const row = entitled ?? (await listUserSubscriptions(userId)).subscriptions[0] ?? null
  if (!row) return { active: false, planKey: null, planLabel: null, status: null, validUntil: null }
  // `subscriptions.plans` (the module's config, by plan key): the label without the Stripe prices `getResolvedPlans` loads.
  const plans = (useRuntimeConfig(event) as { subscriptions?: { plans?: Record<string, { label?: string }> } }).subscriptions?.plans ?? {}
  const planLabel = row.planKey ? (plans[row.planKey]?.label ?? row.planKey) : null
  return {
    active: !!entitled,
    planKey: row.planKey ?? null,
    planLabel,
    status: row.status ?? null,
    validUntil: isoDate(row.currentPeriodEnd),
  }
}

/** Approved crew and team places of the user in operations that are not over, names in the request's language. */
async function frigearIdCrew(event: H3Event, userId: number): Promise<FrigearIdVerification['crew']> {
  const [entries, operations] = await Promise.all([crewMyEntries(event, userId), listParticipatingOperations(event, userId)])
  const now = Date.now()
  const current = new Map(operations
    .filter(operation => !OVER_STATUSES.has(operation.status) && (!operation.endsAt || operation.endsAt.getTime() > now))
    .map(operation => [operation.id, operation]))
  const locale = crewRequestLocale(event) || 'da'
  return entries
    .filter(entry => entry.crewStatus === 'approved' && current.has(entry.operationId))
    .map(entry => ({
      operation: { id: entry.operationId, name: translate(entry.operationName, locale, 'en') },
      team: { id: entry.teamId, name: translate(entry.teamName, locale, 'en') },
      role: { key: entry.role, label: translate(entry.roleLabel, locale, 'en') || entry.role },
    }))
}

/**
 * What a crew member scanning a Frigear ID sees about its owner: name, photo, roles, membership and current crew
 * places. Never an email address or phone number. 404 when the user no longer exists.
 */
export async function toFrigearIdVerification(event: H3Event, userId: string): Promise<FrigearIdVerification> {
  const id = Number(userId)
  const [user, refs] = await Promise.all([
    Number.isSafeInteger(id) ? loadAuthUser(id) : null,
    loadUserRefs([id]),
  ])
  const ref = refs.get(id)
  if (!user || !ref) throw notFound('This Frigear ID belongs to an account that no longer exists.')

  const [roles, membership, crew] = await Promise.all([
    frigearIdRoles(event, user),
    frigearIdMembership(event, id),
    frigearIdCrew(event, id),
  ])
  return {
    valid: true,
    user: { id: String(id), name: ref.name, avatar: ref.avatar },
    roles,
    membership,
    crew,
    verifiedAt: new Date().toISOString(),
  }
}
