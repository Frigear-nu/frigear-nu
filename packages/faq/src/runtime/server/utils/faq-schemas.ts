import { z } from 'zod'
import { visibilitySchema } from '@frigear-nu/audience'
import { FAQ_SLUG_PATTERN, isReservedFaqSlug } from '../../utils'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const faqTranslated = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

/** A link target a visitor can safely follow: a path on the site, a web address, an email or phone link or an anchor. */
const linkTarget = z.string().trim().min(1).max(500)
  .refine(value => /^(?:\/(?![/\\])|#|https?:\/\/|mailto:|tel:)/i.test(value), 'Use a path, a web address starting with https://, or a mailto: or tel: link.')

export const faqLinkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  to: linkTarget,
  icon: z.string().trim().min(1).max(100).optional(),
})

/** Who owns a group: `{ type, id }`, like the `ownerType` / `ownerId` columns. `platform` has no id. */
export const faqOwnerSchema = z.object({
  type: z.string().trim().min(1).max(64),
  id: z.string().trim().min(1).max(128).nullish(),
})

const groupFields = z.object({
  slug: z.string().min(1).max(128).regex(FAQ_SLUG_PATTERN, 'Use lowercase letters, numbers and dashes.')
    .refine(slug => !isReservedFaqSlug(slug), 'This URL name is reserved.'),
  title: faqTranslated,
  description: faqTranslated.nullish(),
  icon: z.string().trim().min(1).max(100).nullish(),
  owner: faqOwnerSchema.optional(),
  // Strict: an unknown key (a `permission`, a typo) is a 400 instead of silently widening to "every signed-in user".
  visibility: visibilitySchema.nullish(),
  sort: z.number().int().min(0).max(1_000_000).optional(),
})

/** The body of `POST /api/admin/faq/groups`. */
export const faqGroupInput = groupFields

/** The body of `PATCH /api/admin/faq/groups/:id`: any of the fields. */
export const faqGroupPatchSchema = groupFields.partial()

const itemFields = z.object({
  question: faqTranslated,
  answer: faqTranslated,
  icon: z.string().trim().min(1).max(100).nullish(),
  links: z.array(faqLinkSchema).max(10).nullish(),
  visibility: visibilitySchema.nullish(),
})

/** The body of `POST /api/admin/faq/groups/:id/items`: a new item is always a draft. */
export const faqItemInput = itemFields

/** The body of `PATCH /api/admin/faq/items/:id`: any of the fields. The status has its own routes. */
export const faqItemPatchSchema = itemFields.partial()

/** The body of `POST /api/admin/faq/groups/:id/reorder`. */
export const faqReorderInput = z.object({ itemIds: z.array(z.string().trim().min(1)).max(1000) })

const flag = z.enum(['1', 'true', '0', 'false']).optional().transform(value => value === '1' || value === 'true')

/** The query of `GET /api/faq/groups`. */
export const faqListQuery = z.object({
  slugs: z.string().trim().max(2000).optional(),
  operation: z.string().trim().max(128).optional(),
  public: flag,
})

/** The query of `GET /api/faq/search`. */
export const faqSearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  operation: z.string().trim().max(128).optional(),
  public: flag,
})

/** `a, b,,a` becomes `['a', 'b']`: trimmed, without empty entries or repeats. */
export function parseFaqSlugs(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(',').map(slug => slug.trim()).filter(Boolean))]
}
