// Typed path builders of the crew HTTP API. App code, tests and docs use these instead of string literals, so a changed
// URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

/** Self-service routes, under `/api/crew`. */
const BASE = '/api/crew'
/** Staff routes, under `/api/admin/crew`. */
const ADMIN_BASE = '/api/admin/crew'

export const crewApi = {
  me: {
    /** `GET` my crew status in every operation I applied to or work at. */
    crew: `${BASE}/me`,
    /** `POST` to withdraw my application or my place in an operation's crew. */
    withdraw: (operationId: string) => `${BASE}/me/${enc(operationId)}/withdraw`,
  },
  /** `GET` what the apply page needs for an operation (its id or URL name): the form to render, or why not. */
  apply: (operation: string) => `${BASE}/operations/${enc(operation)}/apply`,
  /** `POST` to accept an invite link: joins the invite's team, approved, with the invite's role. */
  acceptInvite: (token: string) => `${BASE}/invites/${enc(token)}/accept`,
  admin: {
    /** `GET` / `PUT` how an operation's crew is recruited. */
    settings: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/settings`,
    /** `GET` (paginated, `?status&team&previous&q`) an operation's crew. Team leads get their own teams. */
    members: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/members`,
    /** `POST` `{ ids }` to approve several people at once. */
    approveMany: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/members/approve`,
    /** `GET` one crew member / `PATCH` `{ teamId?, role? }` to move them. */
    member: (id: string) => `${ADMIN_BASE}/members/${enc(id)}`,
    /** `POST` `{ teamId?, role? }` to approve, optionally into another team or role. */
    approve: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/approve`,
    /** `POST` to reject. */
    reject: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/reject`,
    /** `POST` to put on the waiting list. */
    waitlist: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/waitlist`,
    /** `GET` the application's answers (needs `crew:pii`). */
    submission: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/submission`,
    /** `GET` / `POST` an operation's invite links. */
    invites: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/invites`,
    /** `DELETE` (revoke) one invite. */
    invite: (id: string) => `${ADMIN_BASE}/invites/${enc(id)}`,
  },
} as const
