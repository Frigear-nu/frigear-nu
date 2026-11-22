import { z } from 'zod'
import { scheduleSchema } from '@frigear-nu/module-kit/schedule'
import { MAX_AREA_CORNERS, MAX_RADIUS_METERS, geoPointSchema } from '@frigear-nu/maps/schemas'
import { OPERATION_SLUG_PATTERN, OPERATION_STATUSES, isReservedOperationSlug } from '../../utils'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const operationTranslated = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

// A strict instant: an ISO datetime with an offset (`2027-06-27T10:00:00.000Z`). Offset-free strings would be read in the
// server's time zone, and null, true or 0 must not become 1970.
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))

/**
 * Where the operation takes place: a name and an address, and the location picker's value of `@frigear-nu/maps` (a
 * `point`, with `radiusMeters` or an `area` around it). A radius or an area needs the point, never both, and an empty
 * location is refused: send `null` to clear it.
 */
export const operationLocationSchema = z.object({
  name: operationTranslated.optional(),
  address: z.string().trim().max(300).optional(),
  point: geoPointSchema.optional(),
  radiusMeters: z.number().positive().max(MAX_RADIUS_METERS).optional(),
  area: z.array(geoPointSchema).min(3).max(MAX_AREA_CORNERS).optional(),
}).superRefine((location, ctx) => {
  if (location.name === undefined && location.address === undefined && location.point === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Give the location a name, an address or a place on the map.', path: ['name'] })
  }
  if ((location.radiusMeters !== undefined || location.area !== undefined) && location.point === undefined) {
    ctx.addIssue({ code: 'custom', message: 'A radius or an area needs a point.', path: ['point'] })
  }
  if (location.radiusMeters !== undefined && location.area !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'A location has a radius or an area, not both.', path: ['area'] })
  }
})

const operationFields = z.object({
  // `me` is the static segment of `/api/operations/me`: h3's router never falls back to `:slug` past it.
  slug: z.string().min(1).max(128).regex(OPERATION_SLUG_PATTERN, 'Use lowercase letters, numbers and dashes.')
    .refine(slug => !isReservedOperationSlug(slug), 'This URL name is reserved.'),
  name: operationTranslated,
  description: operationTranslated.nullish(),
  hostName: z.string().trim().max(200).nullish(),
  hostUrl: z.url({ protocol: /^https?$/ }).max(500).nullish(),
  startsAt: date,
  endsAt: date.nullish(),
  schedule: scheduleSchema.nullish(),
  location: operationLocationSchema.nullish(),
  public: z.boolean().optional(),
  // Checked against the events table when `@frigear-nu/events` is installed (`operationsEventExists`).
  eventId: z.string().trim().min(1).max(64).nullish(),
})

const endsAfterStart = (value: { startsAt?: Date, endsAt?: Date | null }) =>
  !value.startsAt || !value.endsAt || value.endsAt >= value.startsAt

/** The body of `POST /api/admin/operations`: a new operation always starts in `planning`. */
export const operationInput = operationFields.refine(endsAfterStart, { message: 'The end cannot be before the start.', path: ['endsAt'] })

/** The body of `PATCH /api/admin/operations/:id`: any of the fields. The status has its own route. */
export const operationPatchSchema = operationFields.partial()

/** The body of `POST /api/admin/operations/:id/status`. */
export const operationStatusInput = z.object({ status: z.enum(OPERATION_STATUSES) })

/** The query of the public list: `status` narrows it, archived operations only show when asked for. */
export const operationListQuery = z.object({ status: z.enum(OPERATION_STATUSES).optional() })

export { endsAfterStart as operationEndsAfterStart }

/** The body of `PUT /api/admin/operations/:id/venue-layout`; the layout itself is checked by `validatePlaneLayout`. */
export const operationVenueLayoutInput = z.object({ layout: z.unknown(), revision: z.string().min(1).max(32).optional() })

/** The query of the underlay upload: the layout revision the client read (optional, 409 when it changed). */
export const operationVenueUnderlayQuery = z.object({ revision: z.string().min(1).max(32).optional() })
