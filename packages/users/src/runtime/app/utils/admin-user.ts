// The shapes of the users admin API, shared by the admin pages, their tabs and `useUserActions`.
export type UserSubscription = { planKey: string | null, status: string }

/** One row of `GET /api/admin/users`. */
export type UserRow = {
  id: number
  name: string
  email: string
  role?: string
  emailVerifiedAt: string | null
  lastLoginAt?: string | null
  createdAt: string
  subscription?: UserSubscription | null
}

/** `GET /api/admin/users` */
export type UsersPage = {
  items: UserRow[]
  total: number
  page: number
  pageSize: number
  hasRoles: boolean
  hasSubscriptions: boolean
  roles: string[]
}

/** The shape of `GET /api/admin/users/:id`. */
export type UserDetail = {
  id: number
  name: string
  email: string
  role?: string
  emailVerifiedAt: string | null
  lastLoginAt?: string | null
  createdAt: string
  hasPassword: boolean
  passkeys: number
  subscription: UserSubscription | null
  hasRoles: boolean
  roles: string[]
  can: { update: boolean, delete: boolean }
}

/** What the actions need of a user: the list rows and the detail both satisfy it. */
export type UserSubject = Pick<UserRow, 'id' | 'name' | 'emailVerifiedAt'>

/** The key of the list's `useFetch`, refreshed after a user is created or deleted. */
export const ADMIN_USERS_KEY = 'admin-users'
