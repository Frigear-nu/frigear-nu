// In-memory state of the test fixture, shared by its plugin and its test routes.

/** What a module like teams or crew would report about a user to `audience:viewer:resolve`. */
export type TestViewerState = {
  operationIds: string[]
  teamRoles: Array<{ ownerType: string, ownerId: string | null, teamId: string, kind: string, role: string, source: 'explicit' | 'mapped' }>
}

const viewers = new Map<string, TestViewerState>()

export function testSetViewer(userId: string | number, state: Partial<TestViewerState>) {
  viewers.set(String(userId), { operationIds: state.operationIds ?? [], teamRoles: state.teamRoles ?? [] })
}

export function testViewerOf(userId: string | number): TestViewerState | undefined {
  return viewers.get(String(userId))
}

/** The ids the fixture's `audience:owner:resolve` answers `exists: true` for, by owner type. */
export const testOwners: Record<string, Record<string, { name: string | Record<string, string> }>> = {
  operation: { opr_known: { name: { en: 'Known operation', da: 'Kendt operation' } } },
  team: { tem_known: { name: 'Known team' } },
}

/** Every FAQ hook that fired, in order. */
export const testHookLog: Array<{ name: string, groupId: string, itemId?: string, publishedCount?: number }> = []
