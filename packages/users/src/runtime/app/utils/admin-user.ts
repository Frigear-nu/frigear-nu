// The shapes of the users admin API, shared by the admin pages, their tabs and `useUserActions`.
import type { AdminUserDto } from '../../../types'

export type UserSubscription = { planKey: string | null, status: string }

/** One row of `GET /api/admin/users` (and `GET /api/admin/users/new`); the create response has no `subscription`. */
export type UserRow = AdminUserDto & {
  subscription?: UserSubscription | null
  /** The user's stored roles (`@frigear-nu/authorization`), when it is installed. */
  roles?: string[]
}

/** A role the list can be filtered by. */
export type UserRoleOption = { value: string, label: string, labelKey?: string }

/** `GET /api/admin/users` */
export type UsersPage = {
  items: UserRow[]
  total: number
  page: number
  pageSize: number
  hasRoles: boolean
  hasSubscriptions: boolean
  roles: UserRoleOption[]
}

/** The shape of `GET /api/admin/users/:id`. */
export type UserDetail = AdminUserDto & {
  hasPassword: boolean
  passkeys: number
  subscription: UserSubscription | null
  /** `manage`: change or verify the email address (`users:manage`). */
  can: { update: boolean, delete: boolean, manage: boolean }
}

/** What the actions need of a user: the list rows and the detail both satisfy it. */
export type UserSubject = Pick<UserRow, 'id' | 'name' | 'emailVerifiedAt'>

/** The key of the list's `useFetch`, refreshed after a user is created or deleted. */
export const ADMIN_USERS_KEY = 'admin-users'
