import type { H3Event } from 'h3'
import type { ButtonProps, PageCardProps } from '@nuxt/ui'
import type { OwnerRef, Visibility } from '@frigear-nu/audience'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated, Visibility, OwnerRef }

type ForwardedProps = Pick<PageCardProps, 'title' | 'description' | 'icon' | 'to' | 'spotlight' | 'variant' | 'class'>

/**
 * What `FaqCard` takes, and the shape of the inline `items` of `FaqGrid` and `FaqSectionList` (what the website's page
 * frontmatter holds). A managed group maps to it with `toFaqCardProps(group)`.
 */
export type FaqCardProps = ForwardedProps & {
  faqs?: {
    icon?: string
    trailingIcon?: string
    /** The question. Rendered as MDC. */
    title: string
    /** The answer. Rendered as MDC inside a blockquote. */
    details?: string
    lines?: string[]
    as?: string
    /** Buttons under the answer. */
    links?: ButtonProps[]
  }[]
  links?: ButtonProps[]
  /** A contact button: `label` and `initial` go to the contact component (see `contactComponent`). */
  contact?: ButtonProps & {
    initial?: Record<string, unknown>
  }
}

/** `draft` items are only seen by staff; `published` ones by everyone their visibility allows. */
export type FaqItemStatus = 'draft' | 'published'

/** A button under a card or an answer, the shape Nuxt UI's `ButtonProps` takes (`label`, `to`, `icon`). */
export type FaqLink = {
  label: string
  to: string
  icon?: string
}

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** Staff FAQ group list and editor (needs the `faq:manage` permission). `true` = `/admin/faq`. Off by default. */
      admin?: string | boolean
    }
    /**
     * Locales an item must have in both `question` and `answer` before it can be published. Defaults to
     * `['da', 'en']`. An item missing one answers `409 missing_translations`.
     */
    requiredLocales?: string[]
    /** Emit `FAQPage` JSON-LD for public groups. On by default; `false` turns it off. */
    schema?: boolean
    /**
     * The name of a globally resolvable component the card renders for its `contact` prop, with `{ label, initial }`
     * (for example `'ContactFormModal'`). Without it a built-in button opens a form of `@frigear-nu/forms`, when installed.
     */
    contactComponent?: string
    /** Slug of the `@frigear-nu/forms` form the built-in contact button opens. Defaults to `contact`. */
    contactForm?: string
    /** Add an FAQ tab to the mobile app (needs `@frigear-nu/mobile`). Off by default. */
    mobileTab?: boolean
  }
}

export type PublicModuleOptions = {
  pages: { admin?: string, adminGroup?: string }
  requiredLocales: string[]
  schema: boolean
  contactComponent: string | null
  contactForm: string
  /** `@frigear-nu/forms` is installed: the built-in contact button can open its form. */
  forms: boolean
  /** The path of the mobile FAQ tab page, or `undefined` when there is none. */
  mobilePage?: string
}

/** One question and its answer, as every viewer who may read it sees it. */
export type FaqItemDto = {
  id: string
  groupId: string
  question: Translated
  /** Markdown or MDC, per locale. */
  answer: Translated
  icon: string | null
  links: FaqLink[]
  sort: number
  /** The item is visible to anonymous visitors (its group is public and it does not narrow that). */
  public: boolean
}

/** A group with the published items the viewer may read. */
export type FaqGroupDto = {
  id: string
  slug: string
  title: Translated
  description: Translated | null
  icon: string | null
  owner: OwnerRef
  sort: number
  /** Anonymous visitors may read the group (`visibility.public`). */
  public: boolean
  items: FaqItemDto[]
}

/** A group as staff see it: the visibility, the audit dates and how many items it has. */
export type AdminFaqGroupDto = Omit<FaqGroupDto, 'items'> & {
  visibility: Visibility | null
  itemCount: number
  publishedCount: number
  createdAt: string
  updatedAt: string
}

/** An item as staff see it: every status, the visibility of its own and who changed it last. */
export type AdminFaqItemDto = Omit<FaqItemDto, 'public'> & {
  status: FaqItemStatus
  visibility: Visibility | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

/** One hit of `GET /api/faq/search`. */
export type FaqSearchResult = {
  group: { id: string, slug: string, title: Translated }
  item: FaqItemDto
}

/** The locales an item still lacks, by field, when it cannot be published. */
export type MissingTranslations = { field: 'question' | 'answer', locales: string[] }[]

/** Context of `faq:item:published`. */
export type FaqItemPublishedContext = {
  event: H3Event
  group: AdminFaqGroupDto
  item: AdminFaqItemDto
}

/** Context of `faq:group:updated`: the group was created or edited, reordered, or one of its items changed state. */
export type FaqGroupUpdatedContext = {
  event: H3Event
  group: AdminFaqGroupDto
}
