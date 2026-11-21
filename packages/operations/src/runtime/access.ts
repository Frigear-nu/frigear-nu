import { defineAccess } from '@frigear-nu/auth/access'

// What the operations module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests
// name the permissions through it (`operationsAccess.permissions.manage` is `'operations:manage'`).
// The policy on `operations:read` (`server/policies.ts`) receives the OPERATION row: a record is readable when it is
// public, when the user takes part in it (`operations:participation:resolve`, answered by crew) or when the caller holds
// `operations:manage`.
export const operationsAccess = defineAccess('operations', {
  permissions: {
    manage: {
      label: 'Manage operations',
      description: 'Create and edit operations, move them through their statuses and delete them.',
      grantTo: ['admin', 'coordinator'],
    },
    // Self-service: every signed-in user holds it, also without `@frigear-nu/authorization`. Which operations they
    // may read is the policy's business.
    read: {
      label: 'Read operations',
      description: 'Read the public operations and the ones you take part in.',
      implicit: true,
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; the permission itself is a usable scope as well.
    operations: {
      label: 'Operations',
      description: 'Read the public operations and the ones you take part in.',
      icon: 'i-lucide-tent',
      permissions: ['operations:read'],
    },
  },
})
