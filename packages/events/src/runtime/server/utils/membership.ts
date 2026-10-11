import type { MembershipCheckContext, MembershipOptionsContext, MembershipRequirement } from '../../types'

// Memberships are provided by whoever listens to `events:membership:*` (`@frigear-nu/subscriptions` does). This
// module never depends on a particular provider; with none installed a requirement fails closed.

async function holds(userId: number, requirement: 'any' | string[]): Promise<boolean> {
  const ctx: MembershipCheckContext = { userId, requirement, satisfied: false }
  await useNitroApp().hooks.callHook('events:membership:check', ctx)
  return ctx.satisfied
}

/** True when `requirement` is null, or a membership provider confirms the user holds a matching membership. */
export async function meetsMembership(userId: number, requirement: MembershipRequirement | undefined): Promise<boolean> {
  if (!requirement) return true
  return holds(userId, requirement)
}

/** True when `exclusion` is null, or the user holds none of the excluded memberships (`'any'` = no membership at all). */
export async function passesExclusion(userId: number, exclusion: MembershipRequirement | undefined): Promise<boolean> {
  if (!exclusion) return true
  return !(await holds(userId, exclusion))
}

/** What the installed membership provider(s) offer; `available` is false when there is none. */
export async function getMembershipOptions(): Promise<MembershipOptionsContext> {
  const ctx: MembershipOptionsContext = { available: false, options: [] }
  await useNitroApp().hooks.callHook('events:membership:options', ctx)
  return ctx
}
