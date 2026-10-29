import { z } from 'zod'
import type { AdminAddonDto, AdminAddonGroupDto, AdminEventDetailDto, AdminEventDto, AdminTicketTypeDto, AttendeeDto, Translated } from '../../../types'

// The staff views of the admin API's DTOs (`AdminEventDetailDto` of `GET /api/admin/events/:id`, ...).
export type StaffAddon = AdminAddonDto
export type StaffAddonGroup = AdminAddonGroupDto & { addons: StaffAddon[] }
export type StaffTicketType = AdminTicketTypeDto & { addonGroups: StaffAddonGroup[] }
export type StaffEvent = AdminEventDetailDto

/** The fields the event list shows (`GET /api/admin/events` items); the full `StaffEvent` fits it too. */
export type StaffEventSummary = Pick<AdminEventDto, 'id' | 'slug' | 'name' | 'status' | 'startsAt' | 'location'>

/** One page of `GET /api/admin/events`. */
export type StaffEventsPage = { items: AdminEventDto[], total: number, page: number, pageSize: number }

/** One page of `GET /api/admin/events/:id/tickets`. */
export type AttendeesPage = { items: AttendeeDto[], total: number, page: number, pageSize: number }

/** `datetime-local` inputs want the local time without a zone, not the stored ISO instant. */
export const toLocalInput = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export const EVENT_STATUSES = ['draft', 'published', 'archived'] as const
export type EventStatus = typeof EVENT_STATUSES[number]

type Translate = (key: string, fallback: string, params?: Record<string, string | number>) => string
type TranslateText = (value: Translated | null | undefined) => string

/**
 * The event form, shared by the create slideover (`EventFormSlideover`) and the "Details" tab so both validate the
 * same way. `t` is `useModuleT('events')`, `tr` is `useEventsTranslate()`. Dates are `datetime-local` strings.
 */
export function eventFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
    slug: z.string().trim()
      .min(1, t('admin.slugRequired', 'Enter a URL name.'))
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, t('admin.slugInvalid', 'Use lowercase letters, numbers and dashes.')),
    startsAt: z.string().min(1, t('admin.startsRequired', 'Enter when the event starts.')),
    endsAt: z.string().optional(),
    status: z.enum(EVENT_STATUSES),
    location: z.custom<Translated | undefined>().optional(),
    description: z.custom<Translated | undefined>().optional(),
    body: z.custom<Translated | undefined>().optional(),
  })
}

export type EventFormState = z.output<ReturnType<typeof eventFormSchema>>

/** The membership plans a ticket type can require or exclude (`@frigear-nu/subscriptions`), for the ticket type form. */
export type MembershipPlans = { enabled: boolean, plans: Array<{ label: string, value: string }> }
