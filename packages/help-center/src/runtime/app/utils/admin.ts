import { z } from 'zod'
import type { AdminHelpArticleDto, AdminHelpCategoryDto, AdminHelpChecklistDto, Translated, Visibility } from '../../../types'
import { HELP_SLUG_PATTERN, isReservedHelpSlug } from '../../utils/slug'
import { normalizeVisibility } from '../../utils/visibility'

// The staff views of the admin API's DTOs.
export type StaffHelpCategory = AdminHelpCategoryDto
export type StaffHelpArticle = AdminHelpArticleDto
export type StaffHelpChecklist = AdminHelpChecklistDto

/** One page of `GET /api/admin/help-center/articles`. */
export type StaffHelpArticlesPage = { items: AdminHelpArticleDto[], total: number, page: number, pageSize: number }

export const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

type Translate = (key: string, fallback: string, params?: Record<string, string | number>) => string
type TranslateText = (value: Translated | null | undefined) => string

/** Whether a translated value holds no text in any language (cleared inputs give `''`, `{}` or blank entries). */
export function isEmptyTranslated(value: Translated | null | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  return !Object.values(value).some(text => text.trim())
}

/** `null` for a cleared translated field, so the API stores nothing instead of rejecting `{}`. */
export const emptyTranslatedToNull = (value: Translated | null | undefined) => isEmptyTranslated(value) ? null : value!

/** Owner types the editor offers; other types a module adds can still be typed in. */
export const OWNER_TYPE_OPTIONS = ['platform', 'operation', 'team'] as const

/** The locales still missing in a translated field, for the editor's hint. */
export function missingLocales(value: Translated | null | undefined, locales: readonly string[]): string[] {
  if (!value || typeof value === 'string') return [...locales]
  return locales.filter(locale => !(value[locale] ?? '').trim())
}

const slugSchema = (t: Translate) => z.string().trim()
  .min(1, t('admin.slugRequired', 'Enter a URL name.'))
  .regex(HELP_SLUG_PATTERN, t('admin.slugInvalid', 'Use lowercase letters, numbers and dashes.'))
  .refine(slug => !isReservedHelpSlug(slug), t('admin.slugReserved', 'This URL name is reserved.'))

// --- Categories -------------------------------------------------------------------------------

/** The category form, shared by the create slideover and the edit slideover so both validate the same way. */
export function helpCategoryFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
    slug: slugSchema(t),
    description: z.custom<Translated | undefined>().optional(),
    parentId: z.string().trim().optional(),
    ownerType: z.string().trim().min(1).max(64),
    ownerId: z.string().trim().max(128).optional(),
    visibility: z.custom<Visibility | null>().optional(),
    faqGroups: z.array(z.string()),
  }).refine(value => value.ownerType === 'platform' || !!value.ownerId, {
    message: t('admin.ownerIdRequired', 'Enter the id of the owner.'),
    path: ['ownerId'],
  })
}

export type HelpCategoryFormState = z.output<ReturnType<typeof helpCategoryFormSchema>>

export function emptyHelpCategoryForm(): HelpCategoryFormState {
  return { name: undefined, slug: '', description: undefined, parentId: '', ownerType: 'platform', ownerId: '', visibility: null, faqGroups: [] }
}

export function categoryToForm(category: StaffHelpCategory): HelpCategoryFormState {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? undefined,
    parentId: category.parentId ?? '',
    ownerType: category.owner.type,
    ownerId: category.owner.id ?? '',
    visibility: category.visibility,
    faqGroups: [...category.faqGroups],
  }
}

/** The request body for a category form state. */
export function formToCategoryBody(data: HelpCategoryFormState) {
  return {
    name: data.name,
    slug: data.slug,
    description: emptyTranslatedToNull(data.description),
    parentId: data.parentId || null,
    owner: { type: data.ownerType, id: data.ownerType === 'platform' ? null : data.ownerId || null },
    visibility: normalizeVisibility(data.visibility ?? null),
    faqGroups: data.faqGroups.length ? data.faqGroups : null,
  }
}

// --- Articles ---------------------------------------------------------------------------------

export function helpArticleFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    categoryId: z.string().trim().min(1, t('admin.categoryRequired', 'Choose a category.')),
    slug: slugSchema(t),
    title: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.articleTitleRequired', 'Enter a title.')),
    body: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.bodyRequired', 'Write the article.')),
    visibility: z.custom<Visibility | null>().optional(),
  })
}

export type HelpArticleFormState = z.output<ReturnType<typeof helpArticleFormSchema>>

export function emptyHelpArticleForm(categoryId = ''): HelpArticleFormState {
  return { categoryId, slug: '', title: undefined, body: undefined, visibility: null }
}

export function articleToForm(article: StaffHelpArticle): HelpArticleFormState {
  return { categoryId: article.categoryId ?? '', slug: article.slug, title: article.title, body: article.body, visibility: article.visibility }
}

export function formToArticleBody(data: HelpArticleFormState) {
  return {
    categoryId: data.categoryId,
    slug: data.slug,
    title: data.title,
    body: data.body,
    visibility: normalizeVisibility(data.visibility ?? null),
  }
}

// --- Checklists -------------------------------------------------------------------------------

export function helpChecklistFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
    operationId: z.string().trim().max(128).optional(),
    visibility: z.custom<Visibility | null>().optional(),
  })
}

export type HelpChecklistFormState = z.output<ReturnType<typeof helpChecklistFormSchema>>

export const emptyHelpChecklistForm = (): HelpChecklistFormState => ({ name: undefined, operationId: '', visibility: null })

export const checklistToForm = (checklist: StaffHelpChecklist): HelpChecklistFormState => ({
  name: checklist.name,
  operationId: checklist.operationId ?? '',
  visibility: checklist.visibility,
})

export function formToChecklistBody(data: HelpChecklistFormState) {
  return { name: data.name, operationId: data.operationId || null, visibility: normalizeVisibility(data.visibility ?? null) }
}
