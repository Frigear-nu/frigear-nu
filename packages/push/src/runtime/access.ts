import { defineAccess } from '@frigear-nu/auth/access'

// What the push module adds to access control, registered in `module.ts` (`registerAccess`). `push:devices` is
// self-service for every signed-in user (`implicit`); a policy
// (`server/policies.ts`) keeps it to the user's own devices. `push:manage` and `push:send` are staff only.
export const pushAccess = defineAccess('push', {
  permissions: {
    devices: { label: 'Manage your push devices', description: 'Register and remove your own push devices.', implicit: true },
    manage: { label: 'See users\' push devices', description: 'See the push devices registered by other users.', grantTo: ['admin'] },
    send: { label: 'Send test pushes', description: 'Send a test push notification to a user\'s devices.', grantTo: ['admin'] },
  },
  scopes: {
    push: {
      label: 'Your push devices',
      description: 'Register this device for push notifications.',
      icon: 'i-lucide-bell',
      permissions: ['push:devices'],
    },
  },
})
