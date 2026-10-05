export const ROOT_KEYS = {
  memberships: ['memberships'] as const,
  user: ['user'] as const,
  admin: ['admin'] as const,
}

export const USER_KEYS = {
  membership: [...ROOT_KEYS.user, 'membership'],
  paymentMethods: [...ROOT_KEYS.user, 'paymentMethods'],
  eventTickets: [...ROOT_KEYS.user, 'eventTickets'],
}

export const ADMIN_KEYS = {
  users: [...ROOT_KEYS.admin, 'users'],
}
