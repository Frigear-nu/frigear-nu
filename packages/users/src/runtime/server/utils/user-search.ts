import { searchText } from '@frigear-nu/module-kit/server'

/**
 * `values` with the user's search column (`users.searchText`, the name folded for search) set whenever `name` is
 * written. Every write of a user's name goes through it, so `searchUserRefs` finds `Øyvind` for `øyvind` on sqlite.
 */
export const withUserSearchText = <T extends { name?: string | null }>(values: T): T & { searchText?: string } =>
  typeof values.name === 'string' ? { ...values, searchText: searchText(values.name) } : values
