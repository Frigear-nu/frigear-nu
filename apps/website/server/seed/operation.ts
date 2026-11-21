// Our own operation, inserted or brought up to date by the `seed:operation` task (server/tasks/seed/operation.ts).
// Every value below is real event data that only we can give: each is a `TODO(user)` and `null` (or empty) until it is
// filled in. The task refuses to write anything while a required value is missing.
//
// The venue layout (stations, containers and areas on the floor plan) is not seeded: it is drawn on the uploaded floor
// plan in the operation's Venue layout tab (/admin/operations/:id).

/** One text for every language, or a `{ da, en }` map. */
type Translated = string | Record<string, string>

type GeoPoint = { lat: number, lng: number }

export type SeedOperationTeam = {
  /** The team's name, matched to find it again on the next run (so renaming it here adds a new team). */
  name: Translated
  description?: Translated
  /** How many people the team needs. */
  capacity?: number
}

export type SeedOperation = {
  slug: string | null
  name: Translated | null
  description: Translated | null
  hostName: string | null
  hostUrl: string | null
  startsAt: string | null
  endsAt: string | null
  public: boolean
  location: {
    name?: Translated
    address?: string
    point?: GeoPoint
    radiusMeters?: number
    area?: GeoPoint[]
  } | null
  teams: SeedOperationTeam[]
}

/** The kind of the seeded teams: our bar ladder (`teams.ladders.bar` in nuxt.config.ts). */
export const SEED_OPERATION_TEAM_KIND = 'bar'

/** The required values that are still `TODO(user)`. */
export function missingSeedOperationValues(seed: SeedOperation): string[] {
  const missing: string[] = []
  if (!seed.slug) missing.push('slug')
  if (!seed.name) missing.push('name')
  if (!seed.startsAt) missing.push('startsAt')
  return missing
}

export const seedOperation: SeedOperation = {
  // TODO(user): the URL name, lower case letters, digits and dashes (the public page is /operations/<slug>). Required.
  slug: null,
  // TODO(user): the name, `{ da: '...', en: '...' }`. Required.
  name: null,
  // TODO(user): a short description, `{ da: '...', en: '...' }`, or null.
  description: null,
  // TODO(user): who hosts it (us, or the venue or event we work at), and its website (https://...), or null.
  hostName: null,
  hostUrl: null,
  // TODO(user): when it starts and ends, ISO 8601 with an offset, e.g. '<yyyy>-<mm>-<dd>T<hh>:<mm>:00+02:00'.
  // `startsAt` is required; `endsAt` may be null and is never before `startsAt`.
  startsAt: null,
  endsAt: null,
  // TODO(user): true to show it on its public page to everyone; false shows it only to its crew and staff.
  public: false,
  // TODO(user): where it is: a `name` and/or `address`, and a `point` `{ lat, lng }` with either `radiusMeters` (up to
  // 50000) or an `area` (3 to 500 `{ lat, lng }` corners) around it. Null leaves it empty.
  location: null,
  // TODO(user): the teams, each `{ name: { da, en }, capacity? }`. They are bar teams (the `bar` ladder in
  // nuxt.config.ts). Empty: crew creates one "Crew" team when the first application comes in.
  teams: [],
}
