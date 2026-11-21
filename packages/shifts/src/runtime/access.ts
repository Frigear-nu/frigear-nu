import { defineAccess } from '@frigear-nu/auth/access'

// What the shifts module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`shiftsAccess.permissions.manage` is `'shifts:manage'`). The policies are in
// `server/policies.ts`; the implicit permissions pass for everyone without a record, so routes always authorize again
// with the record once it is loaded.
export const shiftsAccess = defineAccess('shifts', {
  permissions: {
    // Held by everyone, narrowed by the policy: your own shifts, the operations you take part in, the teams you lead, staff.
    read: {
      label: 'Read shifts',
      description: 'See your own shifts, and who is on shift now in the operations you work at.',
      implicit: true,
    },
    // Held by everyone, narrowed by the policy to the person's own assignments.
    swap: {
      label: 'Swap shifts',
      description: 'Offer your own shifts for a swap, and offer to take other people\'s.',
      implicit: true,
    },
    // Held by everyone, narrowed by the policy to the leads of the record's team (lead role and up) and staff.
    lead: {
      label: 'Lead shifts',
      description: 'Check people in, mark attendance and approve swaps on the teams you lead.',
      implicit: true,
    },
    manage: {
      label: 'Manage shifts',
      description: 'Create and publish schedules, create shifts in bulk, assign people and handle every swap.',
      grantTo: ['admin', 'coordinator'],
    },
    // Sensitive (`:pii`): never covered by `shifts:*` or `*`, only granted by name.
    pii: {
      label: 'See the contact details of people on shift',
      description: 'See the email address and phone number of the people on a shift.',
      grantTo: ['admin', 'coordinator'],
    },
  },
  scopes: {
    shifts: {
      label: 'Shifts',
      description: 'See your own shifts.',
      icon: 'i-lucide-calendar-clock',
      permissions: ['shifts:read'],
    },
  },
})
