import { defineAccess } from '@frigear-nu/auth/access'

// What the inbox adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`inboxAccess.permissions.read` is `'inbox:read'`). The policies of `inbox:read` and
// `inbox:reply` (`server/policies.ts`) receive a MAILBOX or a THREAD row.
//
// Every permission is `sessionOnly`: platform mailboxes hold outsiders' messages and are never exposed to API tokens or
// OAuth apps (a bearer gets `403 session_required`). Scopes for the user side come with it.
export const inboxAccess = defineAccess('inbox', {
  permissions: {
    // Held by every signed-in user and narrowed by the policy: staff with `inbox:manage` read every mailbox, a team's
    // leads read the team's mailbox, anyone else whom the mailbox's `grants` admit. A mailbox with an empty
    // list is staff only (and its team's leads), never "every signed-in user". A hidden thread needs its `hiddenBelow` role on top.
    'read': {
      sessionOnly: true,
      label: 'Read inboxes',
      description: 'Read the threads of the mailboxes you have access to.',
      implicit: true,
    },
    // The same narrowing as `inbox:read`: whoever reads a mailbox answers in it.
    'reply': {
      sessionOnly: true,
      label: 'Answer in inboxes',
      description: 'Reply to the threads of the mailboxes you have access to, write internal notes and change their status.',
      implicit: true,
    },
    'assign': {
      sessionOnly: true,
      label: 'Assign inbox threads',
      description: 'Assign threads to the people who answer them.',
      grantTo: ['admin', 'coordinator'],
    },
    'hide': {
      sessionOnly: true,
      label: 'Hide inbox threads',
      description: 'Hide a thread from everybody below one of your own roles.',
      grantTo: ['admin', 'coordinator'],
    },
    'manage': {
      sessionOnly: true,
      label: 'Manage inboxes',
      description: 'Create, edit and delete mailboxes, read every mailbox and erase contacts.',
      grantTo: ['admin'],
    },
    // Outsiders' email addresses and phone numbers. Never covered by a wildcard.
    'pii': {
      sessionOnly: true,
      label: 'See inbox contact details',
      description: 'See the email address, phone number and channel id of the people who write in, and export their data.',
      sensitive: true,
      grantTo: ['admin'],
    },
    // Channel credentials: a token can never change them.
    'channels': {
      label: 'Manage inbox channels',
      description: 'Connect the contact form, email addresses, WhatsApp numbers and Meta pages to mailboxes.',
      sessionOnly: true,
      grantTo: ['admin'],
    },
    // Who read and answered what. Never covered by a wildcard.
    'inbox-audit:pii': {
      sessionOnly: true,
      label: 'Read the inbox audit log',
      description: 'See who viewed, answered, assigned, hid, exported and erased what.',
      sensitive: true,
      grantTo: ['admin'],
    },
  },
})
