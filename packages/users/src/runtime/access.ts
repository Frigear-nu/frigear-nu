import { defineAccess } from '@frigear-nu/auth/access'

// What the users module adds to access control, registered in `module.ts` (`registerAccess`).
export const usersAccess = defineAccess('users', {
  permissions: {
    // Self-service: every signed-in user holds these (also without `@frigear-nu/authorization`), and may delegate them:
    // an API token or OAuth access token given `profile:write` may change the user's name and avatar (`PATCH /me`). The
    // email address and password are not part of it: they change only in a session
    // (`requireUser(event, { sessionOnly: true })`); staff change another user's email with the session-only
    // `users:manage`.
    'profile:read': { label: 'Read your profile', description: 'Read your own name, email and avatar.', implicit: true },
    'profile:write': { label: 'Change your profile', description: 'Change your own name and avatar.', implicit: true },
    // Staff permissions (with the admin pages only), granted through roles (`admin: ['*']` covers them). Reads also work
    // for API tokens and OAuth access tokens given them. Deleting a user and anything that touches how someone signs in
    // (their email, sign-in links) is session only. Roles themselves are `@frigear-nu/authorization`'s.
    'read': { label: 'View users', description: 'See a user\'s profile, sign-in methods and what other modules show on the user page.' },
    'list': { label: 'List users', description: 'Search the user directory and see the sign-up numbers.' },
    'create': { label: 'Add users', description: 'Create users and email them a sign-in link.' },
    'update': { label: 'Edit users', description: 'Change a user\'s name.' },
    'delete': { label: 'Delete users', description: 'Delete users and their sign-in methods.', sessionOnly: true },
    'manage': { label: 'Manage sign-in of users', description: 'Change or verify a user\'s email address and email them a sign-in link.', sessionOnly: true },
  },
})

/** The self-service permissions, registered with or without the admin pages. */
export const USERS_SELF_SERVICE = ['profile:read', 'profile:write'] as const
