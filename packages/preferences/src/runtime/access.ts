import { defineAccess } from '@frigear-nu/auth/access'

// What the preferences module adds to access control, registered in `module.ts` (`registerAccess`).
export const preferencesAccess = defineAccess('preferences', {
  permissions: {
    // Self-service: every signed-in user holds it, and may delegate it to an API token or an OAuth access token (the
    // mobile app changes the channels of its user). The routes only ever act on the caller, so no policy is needed.
    notifications: {
      label: 'Your notification settings',
      description: 'See and change which channels (email, SMS, push) reach you for each kind of message.',
      implicit: true,
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; `preferences:notifications` is usable as a scope as well.
    notifications: {
      label: 'Your notification settings',
      description: 'See and change how you are notified.',
      icon: 'i-lucide-bell',
      permissions: ['preferences:notifications'],
    },
  },
})
