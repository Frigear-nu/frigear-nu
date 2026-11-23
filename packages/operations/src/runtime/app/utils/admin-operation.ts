import { z } from 'zod'
import type { AdminOperationDto, MapLocation, OperationStatus, Translated } from '../../../types'
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

const TRANSLITERATIONS: Record<string, string> = { æ: 'ae', ø: 'oe', å: 'aa', ß: 'ss', œ: 'oe', ð: 'd', þ: 'th', ł: 'l', đ: 'd' }

/**
 * A URL name suggested from a name: Danish letters spelled out (`Æblefest` -> `aeblefest`, `Øl-bar` -> `oel-bar`),
 * accents dropped (`Crème` -> `creme`), anything else between words a dash.
 */
export const slugify = (value: string) => value.toLowerCase()
  .replace(/[æøåßœðþłđ]/g, letter => TRANSLITERATIONS[letter] ?? letter)
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

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
    /** The location picker's value (`<MapLocationField>` of `@frigear-nu/maps`). */
    locationMap: z.custom<MapLocation | null>().optional(),
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
  return { name: undefined, slug: '', description: undefined, hostName: '', hostUrl: '', startsAt: '', endsAt: '', locationName: undefined, locationAddress: '', locationMap: null, public: false, eventId: '' }
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
    locationMap: operationLocationMap(operation.location),
    public: operation.public,
    eventId: operation.eventId ?? '',
  }
}

/** The location picker's value of a stored location: its point with the radius or the area, or `null`. */
export function operationLocationMap(location: AdminOperationDto['location']): MapLocation | null {
  if (!location?.point) return null
  return {
    point: location.point,
    ...(location.radiusMeters ? { radiusMeters: location.radiusMeters } : {}),
    ...(location.area?.length ? { area: location.area } : {}),
  }
}

/** Whether a translated value holds no text in any language (cleared inputs give `''`, `{}` or blank entries). */
export function isEmptyTranslated(value: Translated | null | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  return !Object.values(value).some(text => text.trim())
}

/** `null` for a cleared translated field, so the API stores nothing instead of rejecting `{}`. */
export const emptyTranslatedToNull = (value: Translated | null | undefined) => isEmptyTranslated(value) ? null : value!

/**
 * A `datetime-local` value (the browser's local time, no zone) as the ISO instant the API wants. A value that still
 * equals the stored instant (the input shows minutes only) keeps it, so saving an untouched form never moves a date.
 */
export function localToIso(value: string, stored?: string | null): string {
  if (stored && toLocalInput(stored) === value) return stored
  return new Date(value).toISOString()
}

/** The `location` of the request body: the name, the address and the picker's value; `null` when all are empty. */
export function formToOperationLocation(data: Pick<OperationFormState, 'locationName' | 'locationAddress' | 'locationMap'>) {
  const name = isEmptyTranslated(data.locationName) ? undefined : data.locationName
  const address = data.locationAddress?.trim() || undefined
  const map = data.locationMap ?? null
  if (!name && !address && !map) return null
  return {
    ...(name ? { name } : {}),
    ...(address ? { address } : {}),
    ...(map ? { point: map.point, ...(map.radiusMeters ? { radiusMeters: map.radiusMeters } : {}), ...(map.area?.length ? { area: map.area } : {}) } : {}),
  }
}

/** The request body for a form state. `previous` keeps the stored instants of dates the form shows to the minute. */
export function formToOperationBody(data: OperationFormState, previous?: StaffOperation) {
  return {
    name: data.name,
    slug: data.slug,
    description: emptyTranslatedToNull(data.description),
    hostName: data.hostName || null,
    hostUrl: data.hostUrl || null,
    startsAt: localToIso(data.startsAt, previous?.startsAt),
    endsAt: data.endsAt ? localToIso(data.endsAt, previous?.endsAt) : null,
    location: formToOperationLocation(data),
    public: data.public,
    eventId: data.eventId || null,
  }
}

/** The status shown for an operation, as an i18n key suffix. */
export const statusKey = (status: OperationStatus) => `admin.statuses.${status}`
