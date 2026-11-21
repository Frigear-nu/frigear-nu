// In-memory state of the test fixture, shared by its plugin and its test routes.

/** user id -> team roles the user holds, as teams would report them through `audience:viewer:resolve`. */
const teamRoles = new Map<string, Array<{ kind: string, role: string }>>()

export function testGrantTeamRole(userId: string | number, kind: string, role: string) {
  const key = String(userId)
  teamRoles.set(key, [...(teamRoles.get(key) ?? []), { kind, role }])
}

export const testTeamRolesOf = (userId: string | number) => teamRoles.get(String(userId)) ?? []

/** Every `maps:feature:*` hook that fired, in order, and how often `maps:seed:resolve` was asked. */
export const testMapsLog: { hooks: Array<{ name: string, featureId: string, mapId: string, previousLabel?: unknown }>, seedCalls: number } = {
  hooks: [],
  seedCalls: 0,
}
