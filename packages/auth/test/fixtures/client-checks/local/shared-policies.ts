import { defineSharedPolicy } from '../../../../src/runtime/policies'

export const ownNotes = defineSharedPolicy<{ ownerId: string }, { id: string }>('notes:read', ({ user, record }) =>
  record && user && record.ownerId === user.id ? undefined : false)
