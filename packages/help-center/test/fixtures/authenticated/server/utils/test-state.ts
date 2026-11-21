// In-memory state of the test fixture, shared by its plugins and its test routes.

/** operation id -> the users who take part in it, as crew would report them to the `operation` grant kind. */
const participants = new Map<string, Set<string>>()

export function testTakePart(operationId: string, userIds: string[]) {
  const set = participants.get(operationId) ?? new Set<string>()
  for (const id of userIds) set.add(String(id))
  participants.set(operationId, set)
}

export function testTakesPart(operationId: string, userId: string | number): boolean {
  return participants.get(operationId)?.has(String(userId)) ?? false
}

export function testParticipantsOf(operationIds: string[]): string[] {
  return [...new Set(operationIds.flatMap(id => [...(participants.get(id) ?? [])]))]
}

/** The ids the fixture's `teams:owner:resolve` answers `exists: true` for, by owner type. */
export const testOwners: Record<string, Record<string, { name: string | Record<string, string> }>> = {
  operation: { opr_known: { name: { en: 'Known operation', da: 'Kendt operation' } }, opr_progress: { name: 'Progress operation' } },
  team: { tem_known: { name: 'Known team' } },
}

/** Every email that reached `notify:email`, in order. */
export const testEmails: Array<{ to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown> } }> = []
