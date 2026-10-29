import { z } from 'zod'
import { scheduleSchema } from '@frigear-nu/module-kit/schedule'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const translated = z.union([
  z.string().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])
export const membership = z.union([z.literal('any'), z.array(z.string().min(1))]).nullable()
const date = z.coerce.date()

export const addonInput = z.object({
  label: translated,
  description: translated.nullish(),
  price: z.number().int().min(0).optional(),
  capacity: z.number().int().min(0).nullish(),
  sortOrder: z.number().int().optional(),
})

export const addonGroupInput = z.object({
  title: translated,
  required: z.boolean().optional(),
  multiple: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  addons: z.array(addonInput).optional(),
})

export const ticketTypeInput = z.object({
  key: z.string().min(1).max(64),
  name: translated,
  description: translated.nullish(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).transform(value => value.toUpperCase()).optional(),
  hidePrice: z.boolean().optional(),
  capacity: z.number().int().min(0).nullish(),
  saleStartsAt: date.nullish(),
  saleEndsAt: date.nullish(),
  saleSchedule: scheduleSchema.nullish(),
  maxPerUser: z.number().int().min(1).optional(),
  requiresMembership: membership.optional(),
  excludesMembership: membership.optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  addonGroups: z.array(addonGroupInput).optional(),
})

export const eventInput = z.object({
  // `me` is the static segment of `/api/events/me/...`: h3's router never falls back to `:slug` past it.
  slug: z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.')
    .refine(slug => slug !== 'me', 'This URL name is reserved.'),
  name: translated,
  description: translated.nullish(),
  body: translated.nullish(),
  image: z.string().nullish(),
  location: translated.nullish(),
  locationUrl: z.string().nullish(),
  startsAt: date,
  endsAt: date.nullish(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  requiresMembership: membership.optional(),
  ticketTypes: z.array(ticketTypeInput).optional(),
})
