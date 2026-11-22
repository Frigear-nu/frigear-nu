import { defineGrantKind } from '@frigear-nu/auth/grants'
import { table } from '#auth/roles'
import { roleGrantSchema } from '../../utils/grants'

/** The most users the `role` kind checks when it lists members. */
export const AUTHORIZATION_ROLE_GRANT_MEMBER_LIMIT = 1000

// The `role` grant kind (grant lists of `@frigear-nu/auth`): callers holding a global role (auth's effective roles,
// inheritance included).
//
// `members` is auth's `listRoleHolders`: the users with a role stored in `authorization_user_roles` (this module's role
// provider, `holders`) that is or inherits the wanted one, kept when their effective roles still hold it. A role only
// given through `defaultRoles`, an `auto` role or the `authorization:roles` hook is never stored, so its holders are not
// listed. The holders' stored roles load in one chunked query (the provider's `assignedRolesOf`), not one per holder.
export default defineGrantKind('role', {
  schema: roleGrantSchema,
  async matches({ event, user, grant }) {
    if (!user) return false
    return (await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1])).includes(grant.role)
  },
  async members({ event, grants }) {
    const wanted = [...new Set(grants.map(grant => grant.role))]
    return listRoleHolders(event, wanted, { limit: AUTHORIZATION_ROLE_GRANT_MEMBER_LIMIT })
  },
  // A role that is not configured would be stored and admit nobody, without a word: refuse it when it is saved. Stored
  // grants skip this (`grantsValidate`), so a record whose role was since removed from the config can still be edited.
  validate({ grant }) {
    return Object.hasOwn(table.roles, grant.role) ? undefined : `"${grant.role}" is not a role.`
  },
})
