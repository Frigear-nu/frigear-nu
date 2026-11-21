import { defineAccess } from '@frigear-nu/auth/access'

// What the help center adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`helpCenterAccess.permissions.manage` is `'help-center:manage'`).
// `help-center:read` is implicit and has no record policy: which categories and articles a caller sees is decided by
// their visibility and the viewer (`@frigear-nu/audience`), not by a permission, and public ones need no sign-in.
export const helpCenterAccess = defineAccess('help-center', {
  // The derived i18n keys live under `helpCenter` (the module's namespace), not under `help-center`.
  i18n: 'helpCenter',
  permissions: {
    manage: {
      label: 'Manage the help center',
      description: 'Create and edit categories, articles and checklists, publish articles and delete them.',
      grantTo: ['admin', 'coordinator'],
    },
    send: {
      label: 'Send help articles',
      description: 'Send links to articles to a team, an operation or a role by email or SMS.',
      grantTo: ['admin', 'coordinator'],
    },
    // Who read what exposes people, so no wildcard covers it.
    pii: {
      label: 'See who read what',
      description: 'See the onboarding progress of people: which articles each person read. Never covered by a wildcard.',
      sensitive: true,
      grantTo: ['admin', 'coordinator'],
    },
    // Self-service: every signed-in user holds it, also without `@frigear-nu/authorization`.
    read: {
      label: 'Read help articles',
      description: 'Read the help articles your visibility allows, and keep track of what you have read.',
      implicit: true,
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; the permission itself is a usable scope as well.
    'help-center': {
      label: 'Help center',
      description: 'Read the help articles your visibility allows, and keep track of what you have read.',
      icon: 'i-lucide-life-buoy',
      permissions: ['help-center:read'],
    },
  },
})
