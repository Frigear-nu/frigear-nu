// In-memory state of the test fixture, shared by its plugins and its test routes.

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

/** What `help-center:audience:resolve` answers for an operation or a team, as teams or crew would: user ids. */
export const testAudiences = new Map<string, string[]>()

/** Every email that reached `notify:email`, in order. */
export const testEmails: Array<{ to: string | string[], subject: string, body: string, text?: string, template?: { name: string, props?: Record<string, unknown> } }> = []
