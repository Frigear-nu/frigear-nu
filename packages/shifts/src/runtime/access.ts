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
    // Held by everyone, narrowed by the policy to the leads of the record's team (BA and up on a bar team) and staff.
    lead: {
      label: 'Lead shifts',
      description: 'Check people in, mark attendance and approve swaps on the teams you lead.',
      implicit: true,
    },
    // Held by everyone, narrowed by the policy to the person's own assignments: checking in at a station or by location.
    attend: {
      label: 'Check in on your shifts',
      description: 'Check in on your own shifts by scanning a station\'s code or by your location.',
      implicit: true,
    },
    // Held by everyone, but only through a signed-in session: the calendar feed URL is a secret that shows your shifts to
    // whoever holds it, so a token (or an OAuth client) cannot mint or revoke one.
    feed: {
      label: 'Subscribe to your shifts in a calendar',
      description: 'Create and revoke the secret calendar feed (iCal) of your own shifts.',
      implicit: true,
      sessionOnly: true,
    },
    // Messages people by email and SMS; leads send to their own team through `shifts:lead` instead.
    broadcast: {
      label: 'Message shift teams',
      description: 'Send an email (and an SMS, on purpose) to the members of an operation\'s teams or the people on a shift.',
      grantTo: ['admin', 'coordinator'],
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

// The perks people earned on their shifts, for the app that spends them (frigear-vouchers): read and claim your own
// grants. Both are held by everyone and narrowed by the policy to the caller's own grants; the `perks` scope covers both.
export const perksAccess = defineAccess('perks', {
  permissions: {
    'perks:read': {
      label: 'Read your perks',
      description: 'See the perks you earned on your shifts.',
      implicit: true,
    },
    'perks:claim': {
      label: 'Claim your perks',
      description: 'Mark the perks you earned as claimed, so an app can hand them out.',
      implicit: true,
    },
  },
  scopes: {
    perks: {
      label: 'Perks',
      description: 'See and claim the perks you earned on your shifts.',
      icon: 'i-lucide-ticket',
      permissions: ['perks:read', 'perks:claim'],
    },
  },
})
