import { defineAccess } from '@frigear-nu/auth/access'

// What the campaigns module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name
// the permissions through it (`campaignsAccess.permissions.manage` is `'campaigns:manage'`). The public signup, confirm
// and unsubscribe routes are anonymous: a rate limit and the tokens in the messages guard them.
export const campaignsAccess = defineAccess('campaigns', {
  permissions: {
    'manage': {
      label: 'Manage lists',
      description: 'Create, edit and delete lists, and see how many people are subscribed.',
      grantTo: ['admin'],
    },
    'send': {
      label: 'Send campaigns',
      description: 'Schedule and send campaigns to list subscribers and users.',
      grantTo: ['admin'],
    },
    'send-important': {
      label: 'Send important messages',
      description: 'Send a message that reaches users even on the channels they turned off.',
      grantTo: ['admin'],
    },
    // Sensitive (`:pii`): never covered by `campaigns:*` or `*`, only granted by name.
    'pii': {
      label: 'See subscribers\' contact details',
      description: 'See the email addresses and phone numbers of list subscribers.',
      grantTo: ['admin'],
    },
    // Self-service: every signed-in user holds it. The routes only ever act on the caller's own subscriptions.
    'subscriptions': {
      label: 'Your subscriptions',
      description: 'See and change which lists you are subscribed to.',
      implicit: true,
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; `campaigns:subscriptions` is usable as a scope as well.
    subscriptions: {
      label: 'Your subscriptions',
      description: 'See and change which lists you are subscribed to.',
      icon: 'i-lucide-newspaper',
      permissions: ['campaigns:subscriptions'],
    },
  },
})
