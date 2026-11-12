import { defineAccess } from '@frigear-nu/auth/access'

// What the events module adds to access control, registered in `module.ts` (`registerAccess`). Routes, MCP tools and
// tests name the permissions through it (`eventsAccess.permissions.manage` is `'events:manage'`).
// Policies on `events:manage` and `events:refund` receive the EVENT row as their record, on every route and MCP tool,
// also for actions on a ticket type, add-on or ticket (`authorizeEventsRecord` in `server/utils/admin.ts`).
export const eventsAccess = defineAccess('events', {
  permissions: {
    'manage': {
      label: 'Manage events',
      description: 'Create and edit events, ticket types and add-ons, and check tickets in.',
      grantTo: ['admin', 'eventmanager'],
    },
    'pii': {
      label: 'See attendee details',
      description: 'See attendee names and emails (MCP tools). Never covered by a wildcard.',
      sensitive: true,
      grantTo: ['admin', 'eventmanager'],
    },
    // Money moves: only a signed-in session may refund, never an API or OAuth token (`sessionOnly`). Roles that grant
    // `events:manage` by name need to grant this too (`events:*` covers it).
    'refund': {
      label: 'Refund tickets',
      description: 'Refund a paid ticket. Cookie sessions only.',
      sessionOnly: true,
      grantTo: ['admin', 'eventmanager'],
    },
    // Self-service: every signed-in user holds these, also without `@frigear-nu/authorization`.
    'tickets:read': { label: 'Read your tickets', description: 'Read your tickets and event details.', implicit: true },
    'tickets:write': { label: 'Buy tickets', description: 'Buy tickets and pay for them.', implicit: true },
  },
  scopes: {
    tickets: {
      label: 'Your tickets',
      description: 'Read your tickets and event details, and buy tickets.',
      icon: 'i-lucide-ticket',
      permissions: ['tickets:read', 'tickets:write'],
    },
  },
  roles: {
    // Opt-in (`events.settings.roles`): registered only then, and the permissions' `grantTo` skips it otherwise.
    eventmanager: { label: 'Event manager', grant: ['events:manage', 'events:refund', 'events:pii'] },
  },
})
