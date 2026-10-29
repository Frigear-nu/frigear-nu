// Typed path builders of the events HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id and slug is URL-encoded.

const enc = encodeURIComponent

/** Public and self-service routes, under `/api/events`. */
const PUBLIC_BASE = '/api/events'
/** Staff routes, under `/api/admin/events`. */
const ADMIN_BASE = '/api/admin/events'

export const eventsApi = {
  /** `GET` the published events. */
  list: PUBLIC_BASE,
  /** `GET` one published event with its ticket types (personalised when signed in). */
  event: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}`,
  /** `POST` a ticket purchase. */
  purchase: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}/purchase`,
  me: {
    /** `GET` the caller's tickets (also the account bootstrap's `events:tickets:mine`). */
    tickets: `${PUBLIC_BASE}/me/tickets`,
    /** `GET` one of the caller's tickets. */
    ticket: (id: string) => `${PUBLIC_BASE}/me/tickets/${enc(id)}`,
    /** `POST` to resume paying for one of the caller's pending tickets. */
    pay: (id: string) => `${PUBLIC_BASE}/me/tickets/${enc(id)}/pay`,
  },
  admin: {
    /** `GET` (paginated) / `POST` events. */
    events: ADMIN_BASE,
    /** `GET` / `PATCH` / `DELETE` one event. */
    event: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` a copy of an event as a new draft. */
    clone: (id: string) => `${ADMIN_BASE}/${enc(id)}/clone`,
    /** `GET` an event's tickets with their holders (paginated). */
    attendees: (id: string) => `${ADMIN_BASE}/${enc(id)}/tickets`,
    /** `POST` a ticket type to an event. */
    ticketTypes: (eventId: string) => `${ADMIN_BASE}/${enc(eventId)}/ticket-types`,
    /** `PATCH` / `DELETE` one ticket type. */
    ticketType: (id: string) => `${ADMIN_BASE}/ticket-types/${enc(id)}`,
    /** `POST` an add-on group to a ticket type. */
    addonGroups: (ticketTypeId: string) => `${ADMIN_BASE}/ticket-types/${enc(ticketTypeId)}/addon-groups`,
    /** `PATCH` / `DELETE` one add-on group. */
    addonGroup: (id: string) => `${ADMIN_BASE}/addon-groups/${enc(id)}`,
    /** `POST` an add-on to a group. */
    addons: (groupId: string) => `${ADMIN_BASE}/addon-groups/${enc(groupId)}/addons`,
    /** `PATCH` / `DELETE` one add-on. */
    addon: (id: string) => `${ADMIN_BASE}/addons/${enc(id)}`,
    /** `POST` to cancel an unpaid or free ticket. */
    cancelTicket: (id: string) => `${ADMIN_BASE}/tickets/${enc(id)}/cancel`,
    /** `POST` to refund a paid ticket (session only). */
    refundTicket: (id: string) => `${ADMIN_BASE}/tickets/${enc(id)}/refund`,
    /** `GET` the memberships a ticket type can require or exclude. */
    membershipOptions: `${ADMIN_BASE}/membership-options`,
    /** `GET` the next published events and how many there are (admin dashboard). */
    upcoming: `${ADMIN_BASE}/upcoming`,
    /** `POST` a scanned ticket code. */
    checkIn: `${ADMIN_BASE}/check-in`,
  },
} as const
