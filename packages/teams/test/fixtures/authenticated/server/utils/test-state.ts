// In-memory state of the test fixture, shared by its plugin and its test routes.

/** Operations that "exist" for `audience:owner:resolve` (operations itself is not installed here). */
export const testOperations = new Map<string, string>([
  ['opr_roskilde', 'Roskilde 2027 bar operation'],
  ['opr_priority', 'Priority test operation'],
])

/** user id -> the plan keys the user holds, standing in for active subscriptions. */
const plans = new Map<string, Set<string>>()

export function testGivePlan(userId: string | number, plan: string) {
  const key = String(userId)
  plans.set(key, new Set([...(plans.get(key) ?? []), plan]))
}

export function testHoldsPlan(userId: string | number, plan: string) {
  return plans.get(String(userId))?.has(plan) ?? false
}

/** Every teams hook that fired, in order. */
export const testTeamsHooks: Array<{ name: string, teamId: string, userId: number, role: string, from?: string, to?: string }> = []
