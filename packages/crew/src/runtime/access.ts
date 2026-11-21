import { defineAccess } from '@frigear-nu/auth/access'

// What the crew module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`crewAccess.permissions.manage` is `'crew:manage'`). The policy of `crew:read`
// (`server/policies.ts`) receives a CREW MEMBER (`{ userId, teamId }`: a `team_members` row).
export const crewAccess = defineAccess('crew', {
  permissions: {
    // Self-service: every signed-in user holds it. Apply, see your own status, withdraw, accept an invite.
    apply: {
      label: 'Apply to crew',
      description: 'Apply to an operation\'s crew, see your own status and withdraw.',
      implicit: true,
    },
    // Held by everyone, narrowed by the policy to the person\'s own row, the teams they lead, and staff.
    read: {
      label: 'Read crew',
      description: 'See your own crew status, and the crew of the teams you lead.',
      implicit: true,
    },
    manage: {
      label: 'Manage crew',
      description: 'Approve, reject and waitlist applications, move people between teams and roles, and edit how a crew is recruited.',
      grantTo: ['admin', 'coordinator'],
    },
    // Sensitive (`:pii`): never covered by `crew:*` or `*`, only granted by name.
    pii: {
      label: 'See applicants\' contact details and answers',
      description: 'See the email address, phone number and form answers of people in a crew.',
      grantTo: ['admin', 'coordinator'],
    },
    // Mints a credential that grants a role, so it needs a signed-in session: a token cannot create invites.
    invite: {
      label: 'Create crew invites',
      description: 'Create invite links that add people to a team, optionally as a lead.',
      sessionOnly: true,
      grantTo: ['admin', 'coordinator'],
    },
  },
  scopes: {
    // A named scope groups the permission for token consent; `crew:read` and `crew:pii` are usable as scopes as well.
    crew: {
      label: 'Crew',
      description: 'See your own crew status in operations.',
      icon: 'i-lucide-hand-heart',
      permissions: ['crew:read'],
    },
  },
})
