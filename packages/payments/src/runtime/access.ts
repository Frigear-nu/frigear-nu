import { defineAccess } from '@frigear-nu/auth/access'

// What the payments module adds to access control, registered in `module.ts` (`registerAccess`). Self-service
// permissions every signed-in user holds (`implicit`); `payments:manage` is staff only (the admin role).
export const paymentsAccess = defineAccess('payments', {
  permissions: {
    read: { label: 'Read your payments', description: 'Read your own payments.', implicit: true },
    write: { label: 'Resume your payments', description: 'Resume paying for your own unpaid payments.', implicit: true },
    manage: { label: 'See recent payments', description: 'See recent payments and revenue on the dashboard.', grantTo: ['admin'] },
  },
  scopes: {
    payments: {
      label: 'Your payments',
      description: 'Read your payments and resume unpaid ones.',
      icon: 'i-lucide-credit-card',
      permissions: ['payments:read', 'payments:write'],
    },
  },
})
