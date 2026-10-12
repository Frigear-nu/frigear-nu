import { z } from 'zod'

// Input schemas for the staff tools. The REST schemas (`utils/admin-schemas`) coerce dates and
// transform text, which JSON Schema (what MCP clients receive) cannot represent, so these describe
// the same payload in plain types. Tools still run the payload through the REST schema afterwards,
// so validation stays in one place.

const text = z.union([z.string().min(1), z.record(z.string(), z.string())])
  .describe('Text in one language, or a locale -> text map such as {"en": "Party", "da": "Fest"}.')
const membership = z.union([z.literal('any'), z.array(z.string())]).nullable().describe('"any", a list of plan keys, or null for no rule.')
const isoDate = z.string().describe('ISO 8601 date-time, e.g. 2026-12-24T18:00:00Z.')

const addon = z.object({
  label: text,
  description: text.nullish(),
  price: z.number().int().min(0).optional().describe('Minor units (øre/cents).'),
  capacity: z.number().int().min(0).nullish(),
  sortOrder: z.number().int().optional(),
})

const addonGroup = z.object({
  title: text,
  required: z.boolean().optional(),
  multiple: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  addons: z.array(addon).optional(),
})

const ticketType = z.object({
  key: z.string().min(1).max(64),
  name: text,
  description: text.nullish(),
  price: z.number().int().min(0).optional().describe('Minor units (øre/cents).'),
  currency: z.string().length(3).optional(),
  hidePrice: z.boolean().optional(),
  capacity: z.number().int().min(0).nullish(),
  saleStartsAt: isoDate.nullish(),
  saleEndsAt: isoDate.nullish(),
  maxPerUser: z.number().int().min(1).optional(),
  requiresMembership: membership.optional(),
  excludesMembership: membership.optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  addonGroups: z.array(addonGroup).optional(),
})

export const eventFields = {
  slug: z.string().min(1).max(128).describe('Lowercase letters, numbers and dashes.'),
  name: text,
  description: text.nullish(),
  body: text.nullish(),
  image: z.string().nullish(),
  location: text.nullish(),
  locationUrl: z.string().nullish(),
  startsAt: isoDate,
  endsAt: isoDate.nullish(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  requiresMembership: membership.optional(),
}

export const createEventShape = { ...eventFields, ticketTypes: z.array(ticketType).optional() }

export const updateEventShape = {
  id: z.string().describe('The event id.'),
  patch: z.object(eventFields).partial().describe('Only the fields to change.'),
}
