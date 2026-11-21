// In-memory state of the test fixture, shared by its plugin and its test routes.

/** How a user "takes part": an operation id (crew), an explicit team grant, or a mapped team grant (which must not count). */
export type TestParticipationKind = 'id' | 'explicit' | 'mapped'

/** user id -> the operations the user takes part in, as a module like crew or teams would report them. */
const participation = new Map<string, Array<{ operationId: string, kind: TestParticipationKind }>>()

export function testParticipate(userId: string | number, operationId: string, kind: TestParticipationKind = 'id') {
  const key = String(userId)
  participation.set(key, [...(participation.get(key) ?? []), { operationId, kind }])
}

export function testParticipationOf(userId: string | number) {
  return participation.get(String(userId)) ?? []
}

/** What the `operations:status-changed` hook received, in order. */
export const testStatusChanges: Array<{ id: string, from: string, to: string }> = []

/** Every operations hook that fired, in order: `created`, `updated` or `status-changed`, with the operation's id. */
export const testHookLog: Array<{ name: string, id: string }> = []
