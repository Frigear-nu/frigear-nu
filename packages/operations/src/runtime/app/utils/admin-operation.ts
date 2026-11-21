import { z } from 'zod'
import type { AdminOperationDto, OperationStatus, Translated } from '../../../types'
import { OPERATION_SLUG_PATTERN, isReservedOperationSlug } from '../../utils/slug'

// The staff views of the admin API's DTOs (`AdminOperationDto` of `GET /api/admin/operations/:id`, ...).
export type StaffOperation = AdminOperationDto

/** The fields the operation list shows (`GET /api/admin/operations` items); the full `StaffOperation` fits it too. */
export type StaffOperationSummary = Pick<AdminOperationDto, 'id' | 'slug' | 'name' | 'status' | 'startsAt' | 'endsAt' | 'location' | 'public'>

/** One page of `GET /api/admin/operations`. */
export type StaffOperationsPage = { items: AdminOperationDto[], total: number, page: number, pageSize: number }

/** `datetime-local` inputs want the local time without a zone, not the stored ISO instant. */
export const toLocalInput = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

type Translate = (key: string, fallback: string, params?: Record<string, string | number>) => string
type TranslateText = (value: Translated | null | undefined) => string

/**
 * The operation form, shared by the create/edit slideover (`OperationFormSlideover`) and the "Details" tab so both
 * validate the same way. `t` is `useModuleT('operations')`, `tr` is `useOperationsTranslate()`. Dates are
 * `datetime-local` strings.
 */
export function operationFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
    slug: z.string().trim()
      .min(1, t('admin.slugRequired', 'Enter a URL name.'))
      .regex(OPERATION_SLUG_PATTERN, t('admin.slugInvalid', 'Use lowercase letters, numbers and dashes.'))
      .refine(slug => !isReservedOperationSlug(slug), t('admin.slugReserved', 'This URL name is reserved.')),
    description: z.custom<Translated | undefined>().optional(),
    hostName: z.string().trim().max(200).optional(),
    hostUrl: z.string().trim().max(500).optional().refine(value => !value || /^https?:\/\/\S+$/i.test(value), t('admin.hostUrlInvalid', 'Enter a web address starting with https://.')),
    startsAt: z.string().min(1, t('admin.startsRequired', 'Enter when the operation starts.')),
    endsAt: z.string().optional(),
    locationName: z.custom<Translated | undefined>().optional(),
    locationAddress: z.string().trim().max(300).optional(),
    public: z.boolean(),
    eventId: z.string().trim().max(64).optional(),
  }).refine(value => !value.endsAt || !value.startsAt || new Date(value.endsAt) >= new Date(value.startsAt), {
    message: t('admin.endsBeforeStart', 'The end cannot be before the start.'),
    path: ['endsAt'],
  })
}

export type OperationFormState = z.output<ReturnType<typeof operationFormSchema>>

/** An empty form, for a new operation. */
export function emptyOperationForm(): OperationFormState {
  return { name: undefined, slug: '', description: undefined, hostName: '', hostUrl: '', startsAt: '', endsAt: '', locationName: undefined, locationAddress: '', public: false, eventId: '' }
}

/** The form's state for a stored operation. */
export function operationToForm(operation: StaffOperation): OperationFormState {
  return {
    name: operation.name,
    slug: operation.slug,
    description: operation.description ?? undefined,
    hostName: operation.hostName ?? '',
    hostUrl: operation.hostUrl ?? '',
    startsAt: toLocalInput(operation.startsAt),
    endsAt: toLocalInput(operation.endsAt),
    locationName: operation.location?.name ?? undefined,
    locationAddress: operation.location?.address ?? '',
    public: operation.public,
    eventId: operation.eventId ?? '',
  }
}

/**
 * The request body for a form state. The latitude and longitude of a stored location are not in the form: `previous`
 * keeps them while the place is only renamed.
 */
export function formToOperationBody(data: OperationFormState, previous?: StaffOperation) {
  const kept = previous?.location
  return {
    name: data.name,
    slug: data.slug,
    description: data.description ?? null,
    hostName: data.hostName || null,
    hostUrl: data.hostUrl || null,
    startsAt: data.startsAt,
    endsAt: data.endsAt || null,
    location: data.locationName
      ? { name: data.locationName, ...(data.locationAddress ? { address: data.locationAddress } : {}), ...(kept?.lat !== undefined ? { lat: kept.lat } : {}), ...(kept?.lng !== undefined ? { lng: kept.lng } : {}) }
      : null,
    public: data.public,
    eventId: data.eventId || null,
  }
}

/** The status shown for an operation, as an i18n key suffix. */
export const statusKey = (status: OperationStatus) => `admin.statuses.${status}`
