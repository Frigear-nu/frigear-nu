// In-memory state of the test fixture, shared by its plugin, its grant kind and its test routes.

/** user id -> the clubs of the fixture's `club` grant kind the user is in. */
const clubs = new Map<string, string[]>()

export function testJoinClub(userId: string | number, clubId: string) {
  const key = String(userId)
  clubs.set(key, [...(clubs.get(key) ?? []), clubId])
}

export function testClubsOf(userId: string | number): string[] {
  return clubs.get(String(userId)) ?? []
}

export function testClubMembers(clubIds: string[]): string[] {
  return [...clubs].filter(([, ids]) => ids.some(id => clubIds.includes(id))).map(([userId]) => userId)
}

/** The ids the fixture's `teams:owner:resolve` answers `exists: true` for, by owner type. */
export const testOwners: Record<string, Record<string, { name: string | Record<string, string> }>> = {
  operation: { opr_known: { name: { en: 'Known operation', da: 'Kendt operation' } } },
  team: { tem_known: { name: 'Known team' } },
}

/** Every FAQ hook that fired, in order. */
export const testHookLog: Array<{ name: string, groupId: string, itemId?: string, publishedCount?: number }> = []
