export const ROOT_KEYS = {
  admin: ['admin'] as const,
}

export const ADMIN_KEYS = {
  users: [...ROOT_KEYS.admin, 'users'],
}
