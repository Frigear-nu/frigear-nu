import { z } from 'zod'

export const translated = z.union([z.string().min(1), z.record(z.string(), z.string())])
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
  maxPerUser: z.number().int().min(1).optional(),
  requiresMembership: membership.optional(),
  excludesMembership: membership.optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  addonGroups: z.array(addonGroupInput).optional(),
})

export const eventInput = z.object({
  slug: z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.'),
  name: translated,
  description: translated.nullish(),
  body: translated.nullish(),
  image: z.string().nullish(),
  location: z.string().nullish(),
  locationUrl: z.string().nullish(),
  startsAt: date,
  endsAt: date.nullish(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  requiresMembership: membership.optional(),
  ticketTypes: z.array(ticketTypeInput).optional(),
})
