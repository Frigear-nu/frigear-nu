import { defineAccess } from '@frigear-nu/auth/access'

// What the teams module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name
// the permissions through it (`teamsAccess.permissions.manage` is `'teams:manage'`). The policies of `teams:read` and
// `teams:lead` (`server/policies.ts`) receive the TEAM row.
export const teamsAccess = defineAccess('teams', {
  permissions: {
    // Self-service: every signed-in user holds it. Which teams it covers is the policy's business: the ones the user
    // belongs to (explicit or mapped), and every team for `teams:manage`.
    read: {
      label: 'Read your teams',
      description: 'See the teams you belong to, your role in them and who else is on them.',
      implicit: true,
    },
    // Held by everyone, narrowed by the policy to the teams where the user holds a lead role (the ladder's `leadFrom`
    // and up). Other modules check it on a team record (`authorize(event, 'teams:lead', team)`).
    lead: {
      label: 'Lead your teams',
      description: 'Lead the teams where you hold a lead role on the ladder.',
      implicit: true,
    },
    manage: {
      label: 'Manage teams',
      description: 'Create teams, add and remove members, change their roles, and edit role mapping rules and ladders.',
      grantTo: ['admin', 'coordinator'],
    },
    // Sensitive (`:pii`): never covered by `teams:*` or `*`, only granted by name.
    pii: {
      label: 'See team members\' contact details',
      description: 'See the email addresses of team members.',
      grantTo: ['admin', 'coordinator'],
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; `teams:read` and `teams:pii` are usable as scopes as well.
    teams: {
      label: 'Teams',
      description: 'See the teams you belong to and your role in them.',
      icon: 'i-lucide-users-round',
      permissions: ['teams:read'],
    },
  },
})
