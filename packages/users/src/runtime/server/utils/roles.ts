import { schema } from '@nuxthub/db'
import type { AnyColumn } from 'drizzle-orm'
import { table } from '#auth/roles'

// Roles belong to `@frigear-nu/authorization`; the users admin only filters and sorts its list by the stored ones
// (`authorization_user_roles`), when that module is installed.

/** The `authorization_user_roles` table, when `@frigear-nu/authorization` registered it; else `undefined`. */
export function usersRoleAssignments(): { userId: AnyColumn, role: AnyColumn } | undefined {
  return (schema as unknown as Record<string, unknown>).authorizationUserRoles as { userId: AnyColumn, role: AnyColumn } | undefined
}

/** A role the users list can be filtered by. */
export interface UsersRoleOption {
  value: string
  label: string
  labelKey?: string
}

/**
 * The roles that can be stored on a user (configured, not `auto`, not a default role), for the list filter. Default and
 * `auto` roles are held without a stored row, so filtering by them would find nobody.
 */
export function usersStoredRoleOptions(): UsersRoleOption[] {
  return Object.values(table.roles)
    .filter(role => !role.auto && !role.default)
    .map(role => ({ value: role.name, label: role.label, ...(role.labelKey ? { labelKey: role.labelKey } : {}) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
