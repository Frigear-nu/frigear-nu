import { z } from 'zod'
import { MAX_URL_LENGTH, VANITY_CODE_PATTERN } from '../../utils/codes'

// Request bodies of the admin API. The utils validate the target and the code again (`createShortLink` is called by
// other modules too); these only shape the input.

const date = z.union([z.iso.datetime({ offset: true }), z.iso.date()])

export const shortLinkCreateSchema = z.object({
  url: z.string().trim().min(1).max(MAX_URL_LENGTH),
  code: z.string().trim().regex(VANITY_CODE_PATTERN).optional().or(z.literal('').transform(() => undefined)),
  title: z.string().trim().max(200).nullish(),
  track: z.boolean().optional(),
  expiresAt: date.nullish(),
  autoDelete: z.boolean().optional(),
}).strict()

export const shortLinkPatchSchema = z.object({
  url: z.string().trim().min(1).max(MAX_URL_LENGTH).optional(),
  code: z.string().trim().regex(VANITY_CODE_PATTERN).optional(),
  title: z.string().trim().max(200).nullish(),
  track: z.boolean().optional(),
  expiresAt: date.nullish(),
  autoDelete: z.boolean().optional(),
}).strict()
