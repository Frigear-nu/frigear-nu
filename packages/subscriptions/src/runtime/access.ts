import { defineAccess } from '@frigear-nu/auth/access'

// What the subscriptions module adds to access control, registered in `module.ts` (`registerAccess`).
// `subscriptions:read` is self-service (every signed-in user). Granting a free membership or creating a payment link
// for someone gives away paid access or starts a payment, so it is its own session-only staff permission; staff read a
// user's membership with `users:read`, like the rest of the admin user page.
export const subscriptionsAccess = defineAccess('subscriptions', {
  permissions: {
    read: { label: 'Read your membership', description: 'Read your own subscriptions and the plans.', implicit: true },
    manage: { label: 'Manage memberships', description: 'Grant and revoke free memberships and send payment links to users.', sessionOnly: true },
  },
})
