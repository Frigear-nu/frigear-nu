// The shape of `GET /api/admin/users/:id`, shared by the admin user page and its tabs.
export type AdminUserSubscription = { planKey: string | null, status: string }
export type AdminUserDetail = {
  id: number
  name: string
  email: string
  role?: string
  emailVerifiedAt: string | null
  lastLoginAt?: string | null
  createdAt: string
  hasPassword: boolean
  passkeys: number
  subscription: AdminUserSubscription | null
  hasRoles: boolean
  roles: string[]
  can: { update: boolean, delete: boolean }
}
