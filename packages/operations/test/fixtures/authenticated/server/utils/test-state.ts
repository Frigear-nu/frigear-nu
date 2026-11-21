// In-memory state of the test fixture, shared by its plugin and its test routes.

/** user id -> the operations the user "takes part in", as a module like crew would report them. */
const participation = new Map<string, Set<string>>()

export function testParticipate(userId: string | number, operationId: string) {
  const key = String(userId)
  participation.set(key, (participation.get(key) ?? new Set()).add(operationId))
}

export function testParticipationOf(userId: string | number): string[] {
  return [...(participation.get(String(userId)) ?? [])]
}

/** What the `operations:status-changed` hook received, in order. */
export const testStatusChanges: Array<{ id: string, from: string, to: string }> = []

/** Every operations hook that fired, in order: `created`, `updated` or `status-changed`, with the operation's id. */
export const testHookLog: Array<{ name: string, id: string }> = []
