import { z } from 'zod'
import { grantListShape } from '@frigear-nu/auth/grants'
import { HELP_SLUG_PATTERN, isReservedHelpSlug } from '../../utils/slug'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const helpTranslated = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const slugField = z.string().min(1).max(128).regex(HELP_SLUG_PATTERN, 'Use lowercase letters, numbers and dashes.')
  .refine(slug => !isReservedHelpSlug(slug), 'This URL name is reserved.')

/** A link target a visitor can safely follow: a path on the site, a web address, an email or phone link or an anchor. */
const linkTarget = z.string().trim().min(1).max(500)
  .refine(value => /^(?:\/(?![/\\])|#|https?:\/\/|mailto:|tel:)/i.test(value), 'Use a path, a web address starting with https://, or a mailto: or tel: link.')

/** A button under an article's text. */
export const helpLinkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  to: linkTarget,
  icon: z.string().trim().min(1).max(100).optional(),
})

const iconField = z.string().trim().min(1).max(100).nullish()

/** Who owns a category: `{ type, id }`, like the `ownerType` / `ownerId` columns. `platform` has no id. */
export const helpOwnerSchema = z.object({
  type: z.string().trim().min(1).max(64),
  id: z.string().trim().min(1).max(128).nullish(),
})

const categoryFields = z.object({
  slug: slugField,
  name: helpTranslated,
  description: helpTranslated.nullish(),
  parentId: z.string().trim().min(1).max(128).nullish(),
  owner: helpOwnerSchema.optional(),
  // Who may read it: the shape of a grant list. The handler checks each grant against its kind (`grantsValidate`).
  grants: grantListShape.optional(),
  display: z.enum(['list', 'accordion']).optional(),
  icon: iconField,
  sort: z.number().int().min(0).max(1_000_000).optional(),
})

/** The body of `POST /api/admin/help-center/categories`. */
export const helpCategoryInput = categoryFields

/** The body of `PATCH /api/admin/help-center/categories/:id`: any of the fields. */
export const helpCategoryPatchSchema = categoryFields.partial()

const articleFields = z.object({
  categoryId: z.string().trim().min(1).max(128),
  slug: slugField,
  title: helpTranslated,
  body: helpTranslated,
  // `null` inherits the category; a list narrows it.
  grants: grantListShape.nullish(),
  icon: iconField,
  links: z.array(helpLinkSchema).max(10).nullish(),
  sort: z.number().int().min(0).max(1_000_000).optional(),
})

/** The body of `POST /api/admin/help-center/articles`: a new article is always a draft. */
export const helpArticleInput = articleFields

/** The body of `PATCH /api/admin/help-center/articles/:id`: any of the fields. The status has its own routes. */
export const helpArticlePatchSchema = articleFields.partial()

const flag = z.enum(['1', 'true', '0', 'false']).optional().transform(value => value === '1' || value === 'true')

/** The query of `GET /api/help-center/categories`. */
export const helpCategoriesQuery = z.object({ public: flag })

/** The query of `GET /api/help-center/articles`. */
export const helpArticlesQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(128).optional(),
  public: flag,
})

/** The query of `GET /api/help-center/articles/:slug`. */
export const helpArticleQuery = z.object({ public: flag })

/** The query of `GET /api/help-center/faqs`. */
export const helpFaqsQuery = z.object({
  /** Comma separated category slugs, in the order to show them. None: every accordion category. */
  categories: z.string().trim().max(2000).optional(),
  public: flag,
})

/** `a, b,,a` becomes `['a', 'b']`: trimmed, without empty entries or repeats. */
export function parseHelpSlugs(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(',').map(slug => slug.trim()).filter(Boolean))]
}

/** The body of `POST /api/admin/help-center/categories/:id/reorder`. */
export const helpReorderInput = z.object({ articleIds: z.array(z.string().trim().min(1)).max(1000) })

/** The body of `POST /api/help-center/me/reads`. */
export const helpReadInput = z.object({ articleId: z.string().trim().min(1).max(300) })

const articleRef = z.string().trim().min(1).max(300)

const checklistFields = z.object({
  name: helpTranslated,
  operationId: z.string().trim().min(1).max(128).nullish(),
  grants: grantListShape.optional(),
  sort: z.number().int().min(0).max(1_000_000).optional(),
  /** The whole list of items, in order. Replaces the items the checklist has. */
  items: z.array(z.object({ articleId: articleRef, required: z.boolean().optional() })).max(200).optional(),
})

/** The body of `POST /api/admin/help-center/checklists`. */
export const helpChecklistInput = checklistFields

/** The body of `PATCH /api/admin/help-center/checklists/:id`: any of the fields. */
export const helpChecklistPatchSchema = checklistFields.partial()

/** The body of `POST /api/admin/help-center/send`. */
export const helpSendInput = z.object({
  articleIds: z.array(articleRef).min(1).max(20),
  // Explicit people and/or a grant list: each grant kind lists its members (`@frigear-nu/auth`).
  audience: z.strictObject({
    grants: grantListShape.optional(),
    userIds: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
  }).refine(audience => !!audience.grants?.length || !!audience.userIds?.length, 'Name at least one person or group to send to.'),
  channels: z.array(z.enum(['email', 'sms'])).min(1).max(2),
  /** The language of the message. Defaults to the first required language. */
  locale: z.string().trim().min(2).max(16).optional(),
})
