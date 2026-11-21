import { defineAccess } from '@frigear-nu/auth/access'

// What the faq module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`faqAccess.permissions.manage` is `'faq:manage'`).
// `faq:read` is implicit and has no record policy: which groups and items a caller sees is decided by their
// visibility and the viewer (`@frigear-nu/audience`), not by a permission, and public groups need no sign-in at all.
export const faqAccess = defineAccess('faq', {
  permissions: {
    manage: {
      label: 'Manage FAQ',
      description: 'Create and edit FAQ groups and items, publish them and delete them.',
      grantTo: ['admin', 'coordinator'],
    },
    // Self-service: every signed-in user holds it, also without `@frigear-nu/authorization`.
    read: {
      label: 'Read FAQ',
      description: 'Read the FAQ groups and answers your visibility allows.',
      implicit: true,
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; the permission itself is a usable scope as well.
    faq: {
      label: 'FAQ',
      description: 'Read the FAQ groups and answers your visibility allows.',
      icon: 'i-lucide-message-circle-question-mark',
      permissions: ['faq:read'],
    },
  },
})
