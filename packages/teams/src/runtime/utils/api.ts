// Typed path builders of the teams HTTP API. App code, tests and docs use these instead of string literals, so a changed
// URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

/** Self-service routes, under `/api/teams`. */
const BASE = '/api/teams'
/** Staff routes, under `/api/admin/teams`. */
const ADMIN_BASE = '/api/admin/teams'

export const teamsApi = {
  me: {
    /** `GET` the caller's team roles on every owner, explicit and mapped (`source`). */
    teams: `${BASE}/me`,
  },
  /** `GET` one team the caller belongs to (or manages). */
  team: (id: string) => `${BASE}/${enc(id)}`,
  /** `GET` a team's members: names, emails only with `teams:pii`; `?include=mapped` adds the mapped members. */
  members: (id: string) => `${BASE}/${enc(id)}/members`,
  admin: {
    /** `GET` (paginated, `?ownerType&ownerId&kind&q`) / `POST` teams. */
    teams: ADMIN_BASE,
    /** `GET` / `PATCH` / `DELETE` one team. */
    team: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` `{ userId, role, status? }` to add a member. */
    members: (id: string) => `${ADMIN_BASE}/${enc(id)}/members`,
    /** `PATCH` `{ role?, status? }` / `DELETE` one member, by user id. */
    member: (id: string, userId: number | string) => `${ADMIN_BASE}/${enc(id)}/members/${enc(String(userId))}`,
    /** `GET` (`?ownerType&ownerId&teamId`) / `POST` role mapping rules. */
    mappings: `${ADMIN_BASE}/mappings`,
    /** `PATCH` / `DELETE` one mapping rule. */
    mapping: (id: string) => `${ADMIN_BASE}/mappings/${enc(id)}`,
    /** `GET` every ladder (stored and default). */
    ladders: `${ADMIN_BASE}/ladders`,
    /** `GET` / `PUT` `{ roles, leadFrom }` the ladder of a team kind. */
    ladder: (kind: string) => `${ADMIN_BASE}/ladders/${enc(kind)}`,
    /** `GET` `?q=` users by name or email, to add as members (emails only with `teams:pii`). */
    users: `${ADMIN_BASE}/users`,
  },
} as const
