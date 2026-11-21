import { z } from 'zod'
import type { AdminFaqGroupDto, AdminFaqItemDto, FaqLink, Translated, Visibility } from '../../../types'
import { FAQ_SLUG_PATTERN, isReservedFaqSlug } from '../../utils/slug'
import { normalizeVisibility } from '../../utils/visibility'

// The staff views of the admin API's DTOs.
export type StaffFaqGroup = AdminFaqGroupDto
export type StaffFaqItem = AdminFaqItemDto

/** One page of `GET /api/admin/faq/groups`. */
export type StaffFaqGroupsPage = { items: AdminFaqGroupDto[], total: number, page: number, pageSize: number }

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

// --- Groups ------------------------------------------------------------------------------------

/**
 * The group form, shared by the create slideover and the settings section of the group page so both validate the same
 * way. `t` is `useModuleT('faq')`, `tr` is `useFaqTranslate()`.
 */
export function faqGroupFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    title: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.titleRequired', 'Enter a title.')),
    slug: z.string().trim()
      .min(1, t('admin.slugRequired', 'Enter a URL name.'))
      .regex(FAQ_SLUG_PATTERN, t('admin.slugInvalid', 'Use lowercase letters, numbers and dashes.'))
      .refine(slug => !isReservedFaqSlug(slug), t('admin.slugReserved', 'This URL name is reserved.')),
    description: z.custom<Translated | undefined>().optional(),
    icon: z.string().trim().max(100).optional(),
    ownerType: z.string().trim().min(1).max(64),
    ownerId: z.string().trim().max(128).optional(),
    visibility: z.custom<Visibility | null>().optional(),
  }).refine(value => value.ownerType === 'platform' || !!value.ownerId, {
    message: t('admin.ownerIdRequired', 'Enter the id of the owner.'),
    path: ['ownerId'],
  })
}

export type FaqGroupFormState = z.output<ReturnType<typeof faqGroupFormSchema>>

export function emptyFaqGroupForm(): FaqGroupFormState {
  return { title: undefined, slug: '', description: undefined, icon: '', ownerType: 'platform', ownerId: '', visibility: null }
}

export function groupToForm(group: StaffFaqGroup): FaqGroupFormState {
  return {
    title: group.title,
    slug: group.slug,
    description: group.description ?? undefined,
    icon: group.icon ?? '',
    ownerType: group.owner.type,
    ownerId: group.owner.id ?? '',
    visibility: group.visibility,
  }
}

/** The request body for a form state. */
export function formToGroupBody(data: FaqGroupFormState) {
  return {
    title: data.title,
    slug: data.slug,
    description: emptyTranslatedToNull(data.description),
    icon: data.icon || null,
    owner: { type: data.ownerType, id: data.ownerType === 'platform' ? null : data.ownerId || null },
    visibility: normalizeVisibility(data.visibility ?? null),
  }
}

// --- Items -------------------------------------------------------------------------------------

export function faqItemFormSchema(t: Translate, tr: TranslateText) {
  return z.object({
    question: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.questionRequired', 'Enter the question.')),
    answer: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.answerRequired', 'Enter the answer.')),
    icon: z.string().trim().max(100).optional(),
    links: z.array(z.object({
      label: z.string().trim().min(1, t('admin.linkLabelRequired', 'Enter a label.')),
      to: z.string().trim().min(1, t('admin.linkToRequired', 'Enter where it goes.'))
        .refine(value => /^(?:\/(?![/\\])|#|https?:\/\/|mailto:|tel:)/i.test(value), t('admin.linkToInvalid', 'Use a path, a web address starting with https://, or a mailto: or tel: link.')),
      icon: z.string().trim().max(100).optional(),
    })),
    visibility: z.custom<Visibility | null>().optional(),
  })
}

export type FaqItemFormState = z.output<ReturnType<typeof faqItemFormSchema>>

export function emptyFaqItemForm(): FaqItemFormState {
  return { question: undefined, answer: undefined, icon: '', links: [], visibility: null }
}

export function itemToForm(item: StaffFaqItem): FaqItemFormState {
  return {
    question: item.question,
    answer: item.answer,
    icon: item.icon ?? '',
    links: item.links.map(link => ({ label: link.label, to: link.to, icon: link.icon ?? '' })),
    visibility: item.visibility,
  }
}

export function formToItemBody(data: FaqItemFormState) {
  const links: FaqLink[] = data.links.map(link => ({ label: link.label, to: link.to, ...(link.icon ? { icon: link.icon } : {}) }))
  return {
    question: data.question,
    answer: data.answer,
    icon: data.icon || null,
    links,
    visibility: normalizeVisibility(data.visibility ?? null),
  }
}

/** The locales still missing in a translated field, for the editor's hint. */
export function missingLocales(value: Translated | null | undefined, locales: readonly string[]): string[] {
  if (!value || typeof value === 'string') return [...locales]
  return locales.filter(locale => !(value[locale] ?? '').trim())
}
