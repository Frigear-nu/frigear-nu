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
  },
  /** `GET` what the apply page needs for an operation (its id or URL name): the form to render, or why not. */
  apply: (operation: string) => `${BASE}/operations/${enc(operation)}/apply`,
  /** `GET` (paginated) an operation's crew as the caller may read it: staff all of it, team leads their own teams, others nothing. */
  members: (operationId: string) => `${BASE}/operations/${enc(operationId)}/members`,
  /** `GET` one crew member: yourself, a lead of the team, or staff. */
  member: (id: string) => `${BASE}/members/${enc(id)}`,
  /** `POST` to accept an invite link: joins the invite's team, approved, with the invite's role. */
  acceptInvite: (token: string) => `${BASE}/invites/${enc(token)}/accept`,
  admin: {
    /** `GET` / `PUT` how an operation's crew is recruited. */
    settings: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/settings`,
    /** `GET` (paginated, `?status&team&previous&q`) an operation's whole crew, for staff. */
    members: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/members`,
    /** `POST` `{ userId, teamId?, role? }` to add a person to the crew, approved at once (201; 200 when a withdrawn or rejected row is reused). */
    addMember: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/members`,
    /** `POST` `{ ids }` to approve several people at once. */
    approveMany: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/members/approve`,
    /** `PATCH` `{ teamId?, role? }` to move a crew member. */
    member: (id: string) => `${ADMIN_BASE}/members/${enc(id)}`,
    /** `POST` `{ teamId?, role? }` to approve, optionally into another team or role. */
    approve: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/approve`,
    /** `POST` to reject. */
    reject: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/reject`,
    /** `POST` to mark a person who stepped down as withdrawn (volunteers cannot withdraw themselves). */
    withdraw: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/withdraw`,
    /** `POST` to put on the waiting list. */
    waitlist: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/waitlist`,
    /** `GET` the application's answers (needs `crew:pii`). */
    submission: (id: string) => `${ADMIN_BASE}/members/${enc(id)}/submission`,
    /** `GET` `?q=` users to add to a crew (at most 20; emails and email matches only with `crew:pii`). */
    users: `${ADMIN_BASE}/users`,
    /** `GET` the forms an operation can recruit with (`?operationId=` keeps its own). */
    forms: `${ADMIN_BASE}/forms`,
    /** `GET` / `POST` an operation's invite links. */
    invites: (operationId: string) => `${ADMIN_BASE}/operations/${enc(operationId)}/invites`,
    /** `DELETE` (revoke) one invite. */
    invite: (id: string) => `${ADMIN_BASE}/invites/${enc(id)}`,
  },
} as const
