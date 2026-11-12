import { defineAccess } from '@frigear-nu/auth/access'

// What the admin module adds to access control: the default `settings.permission`, registered in `module.ts` when
// `@frigear-nu/authorization` guards the area and no custom permission is configured.
export const adminAccess = defineAccess('admin', {
  permissions: {
    access: {
      label: 'Access the admin area',
      description: 'Open the pages under the admin area. The data behind them checks its own permissions.',
      grantTo: ['admin'],
    },
  },
})
