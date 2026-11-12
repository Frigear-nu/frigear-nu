import { defineSharedPolicy } from '@frigear-nu/auth/policies'

// Reports are readable by their owner only, on the server and in the client's `can()`.
export const ownReports = defineSharedPolicy<{ ownerId: number }, { id: number }>('reports:read', ({ user, record }) =>
  record && user && record.ownerId === user.id ? undefined : false)
