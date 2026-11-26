import { defineAccess } from '@frigear-nu/auth/access'

// What the short-links module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests
// name the permission through it (`shortLinksAccess.permissions.manage` is `'short-links:manage'`). The redirect itself
// is public; there is no other public API.
export const shortLinksAccess = defineAccess('short-links', {
  i18n: 'shortLinks',
  permissions: {
    manage: {
      label: 'Manage short links',
      description: 'See every short link and its clicks, make links by hand, edit them and disable any link.',
      grantTo: ['admin'],
    },
  },
})
