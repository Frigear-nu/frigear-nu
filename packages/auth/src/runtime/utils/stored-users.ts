import type { AuthStoredUser, AuthUserStore } from '../types'

/**
 * The stored users with these ids (whole positive numbers, numeric strings count, once each): one `findByIds` of the
 * store, or one `findById` per id for a store without it. Unknown ids are left out.
 */
export async function findStoredUsers(store: Pick<AuthUserStore, 'findById' | 'findByIds'>, ids: Iterable<string | number>): Promise<AuthStoredUser[]> {
  const unique = [...new Set([...ids].map(Number))].filter(id => Number.isSafeInteger(id) && id > 0)
  if (!unique.length) return []
  if (store.findByIds) return await store.findByIds(unique)
  const found = await Promise.all(unique.map(id => store.findById(id)))
  return found.filter((user): user is AuthStoredUser => !!user)
}
