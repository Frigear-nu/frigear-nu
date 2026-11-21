import { z } from 'zod'
import { scheduleSchema } from '@frigear-nu/module-kit/schedule'
import { OPERATION_SLUG_PATTERN, OPERATION_STATUSES, isReservedOperationSlug } from '../../utils'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const operationTranslated = z.union([
  z.string().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const date = z.coerce.date()

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
  location: z.object({
    name: operationTranslated,
    address: z.string().trim().max(300).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }).nullish(),
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
