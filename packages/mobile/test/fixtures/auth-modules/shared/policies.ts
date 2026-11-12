import { defineSharedPolicy } from '@frigear-nu/auth/policies'

// The host's shared policy: in client mode it still runs in the app's `can()` (`#auth/shared-policies`).
export const ownOrders = defineSharedPolicy<{ ownerId: string }, { id: string }>('orders:read', ({ user, record }) =>
  record && user && record.ownerId === user.id ? undefined : false)
