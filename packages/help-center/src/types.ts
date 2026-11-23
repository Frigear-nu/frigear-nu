import type { H3Event } from 'h3'
import type { ButtonProps, PageCardProps } from '@nuxt/ui'
import type { Grant } from '@frigear-nu/auth/grants'
import type { OwnerRef } from '@frigear-nu/teams'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated, Grant, OwnerRef }

/** `draft` articles are only seen by staff; `published` ones by everyone their grants admit. */
export type HelpArticleStatus = 'draft' | 'published'

/** The id of a source: `database` and `content` ship with the module, a host registers more. */
export type HelpSourceId = string

/**
 * How a category page shows its articles: `list` links to each article's page, `accordion` shows each article as a
 * question whose text opens in place (an FAQ), `cards` shows each article as a card of its own (an FAQ too): the text
 * before the first block is the card's description, each `::faq-details` block a question that opens in the card and
 * each `::faq-link` / `::faq-contact` block a button at its foot (see `splitFaqBody`).
 */
export type HelpCategoryDisplay = 'list' | 'accordion' | 'cards'

/**
 * What a category is for: `help` holds the help center's own articles (its pages, search and checklists), `faq` the
 * questions embedded on the site's pages (shown on the help center home in an FAQ section of their own). Set when the
 * category is created and fixed afterwards. The help center admin works with `help` only, the FAQ admin with `faq`.
 */
export type HelpCategoryKind = 'help' | 'faq'

/** A button of a `cards` article, from a `::faq-link{...}` block of its text: the props Nuxt UI's `UButton` takes. */
export type FaqBodyLink = {
  label?: string
  to?: string
  icon?: string
  trailingIcon?: string
  variant?: string
  size?: string
  color?: string
  target?: string
}

/** What `splitFaqBody` reads out of the text of a `cards` article: the parts of its card. */
export type FaqBodyParts = {
  /** The Markdown before the first block, the card's description. */
  description: string
  /** Each `::faq-details{label icon}` block: a question of the card, one line per item of its list. */
  details: Array<{ label: string, icon?: string, lines: string[] }>
  /** Each `::faq-link{...}` block: a full-width button at the foot of the card. */
  links: FaqBodyLink[]
  /** The last `::faq-contact{label :initial}` block: the card's contact button. */
  contact?: { label?: string, initial?: Record<string, unknown> }
}

/** A button under an article's text in an accordion, the shape Nuxt UI's `ButtonProps` takes (`label`, `to`, `icon`). */
export type HelpLink = {
  label: string
  to: string
  icon?: string
}

type ForwardedCardProps = Pick<PageCardProps, 'title' | 'description' | 'icon' | 'to' | 'spotlight' | 'variant' | 'class'>

/**
 * What `FaqCard` takes, and the shape of the inline `items` of `FaqGrid` and `FaqSectionList` (cards written in page
 * frontmatter). An accordion category maps to it with `toFaqCardProps(faq)`.
 */
export type FaqCardProps = ForwardedCardProps & {
  faqs?: {
    icon?: string
    trailingIcon?: string
    /** The question. Rendered as MDC. */
    title: string
    /** The answer. Rendered as MDC (through `HelpCenterArticleBody`) inside a blockquote. */
    details?: string
    lines?: string[]
    as?: string
    /** Buttons under the answer. */
    links?: ButtonProps[]
  }[]
  links?: ButtonProps[]
  /** A contact button: `label` and `initial` go to the contact component (see `faq.contactComponent`). */
  contact?: ButtonProps & {
    initial?: Record<string, unknown>
  }
  /** The public area: FAQ components inside an answer read what visitors read, whoever looks. */
  public?: boolean
}

export type ModuleOptions = {
  settings?: {
    pages?: {
      /**
       * The public area, for everyone, with public articles only. Defaults to `/help`; `false` turns it off. Category and
       * article pages follow below it: `<base>/:category` and `<base>/:category/:slug`.
       */
      public?: string | false
      /**
       * The signed-in area: public and restricted articles for the reader, onboarding checklists with read state.
       * Defaults to `/account/help`; `false` turns it off.
       */
      signedIn?: string | false
      /** Staff categories, articles and checklists (needs `help-center:manage`). `true` = `/admin/help-center`. Off by default. */
      admin?: string | boolean
    }
    /**
     * Locales an article must have in both `title` and `body` before it can be published. Defaults to `['da', 'en']`.
     * An article missing one answers `409 missing_translations`.
     */
    requiredLocales?: string[]
    /** Show `HelpCenterSignedInCta` in the public area. On by default; `false` hides it everywhere the module places it. */
    cta?: boolean
    /** Add the signed-in area to the account menu (when it is under `/account`). On by default. */
    accountMenu?: boolean
    /** Add the "Your onboarding" widget to `account.overview`. On by default. */
    accountWidget?: boolean
    /** A layout for a signed-in area outside `/account` (where the account layout does not reach). */
    signedInLayout?: string
    /** The menu to put the signed-in area in when it is outside `/account` (for example `crew`). */
    signedInMenu?: string
    /**
     * The article sources, in the order they are merged. `['database']` by default; `'content'` is added when
     * `content.collection` is set. A custom source is registered with `registerHelpCenterSource` and listed here.
     */
    sources?: HelpSourceId[]
    content?: {
      /** The Nuxt Content collection holding the articles (the host defines it in `content.config.ts`). */
      collection?: string
      /** One collection per locale (`<collection>_<locale>`) instead of a `locale` field in the frontmatter. */
      perLocale?: boolean
      /** The id of the source that wins when two articles share a slug (`database`, `content` or a registered one). Categories always put the database first. Defaults to `database`. */
      precedence?: string
      /** What a missing required language in a content article does at build time. Defaults to `warn`. */
      missingLocales?: 'warn' | 'error'
    }
    /** Add a Help tab to the mobile app (needs `@frigear-nu/mobile`). On by default when mobile is installed. */
    mobileTab?: boolean
    /** Emit `Article` JSON-LD for public articles and `FAQPage` JSON-LD for public accordions. On by default; `false` turns it off. */
    schema?: boolean
    /** The FAQ cards (`Faq`, `FaqGrid`, `FaqSectionList`, `FaqCard`). */
    faq?: {
      /**
       * The name of a globally resolvable component a card renders for its `contact` prop, with `{ label, initial }`
       * (for example `'ContactFormModal'`). Without it a built-in button opens a form of `@frigear-nu/forms`, when installed.
       */
      contactComponent?: string
      /** Slug of the `@frigear-nu/forms` form the built-in contact button opens. Defaults to `contact`. */
      contactForm?: string
    }
  }
}

export type PublicModuleOptions = {
  pages: {
    public?: string
    signedIn?: string
    admin?: string
    adminChecklist?: string
    /** The staff FAQ page (`<admin>/faq`): the accordion and cards categories with their questions. */
    adminFaq?: string
    /** The path of the mobile Help tab page, or `undefined` when there is none. */
    mobile?: string
  }
  requiredLocales: string[]
  cta: boolean
  schema: boolean
  accountMenu: boolean
  accountWidget: boolean
  /** The menu the signed-in area is listed in (`account`, or `signedInMenu`), or `null` for none. */
  menu: string | null
  sources: HelpSourceId[]
  contentCollection: string | null
  /** The FAQ cards' contact button. */
  faq: {
    contactComponent: string | null
    contactForm: string
    /** `@frigear-nu/forms` is installed: the built-in contact button can open its form. */
    forms: boolean
  }
  /** How the site puts locales in paths, or `null` without i18n. Used for links in emails. */
  i18n: { strategy: string, defaultLocale: string | null, locales: string[] } | null
}

/** A category as the viewer who may read it sees it. */
export type HelpCategoryDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  parentId: string | null
  sort: number
  /** Anonymous visitors may read the category (it and every ancestor hold a `public` grant). */
  public: boolean
  source: HelpSourceId
  /** `help` or `faq`, fixed when the category is created. */
  kind: HelpCategoryKind
  /** How the category page shows its articles. */
  display: HelpCategoryDisplay
  /** An icon name such as `i-lucide-info`, or `null`. */
  icon: string | null
}

/** An article without its text: what lists show. */
export type HelpArticleSummaryDto = {
  id: string
  slug: string
  title: Translated
  categorySlug: string
  /** The kind of its category: `faq` articles are questions of an FAQ, not pages of their own. */
  kind: HelpCategoryKind
  source: HelpSourceId
  /** Anonymous visitors may read the article (its category is public and it does not narrow that). */
  public: boolean
  /** An icon name such as `i-lucide-info`, or `null`. */
  icon: string | null
  sort: number
  publishedAt: string | null
  updatedAt: string | null
}

/** An article with its text. */
export type HelpArticleDto = HelpArticleSummaryDto & {
  /** Markdown or MDC, per locale. */
  body: Translated
  /** Buttons under the text in an accordion. */
  links: HelpLink[]
}

/**
 * A category with the published articles the viewer may read, text included: what `GET /api/help-center/faqs` answers
 * and the FAQ cards show.
 */
export type HelpFaqDto = HelpCategoryDto & {
  articles: HelpArticleDto[]
}

/** One article with its category, what `GET /api/help-center/articles/:slug` answers. */
export type HelpArticleDetailDto = HelpArticleDto & {
  category: HelpCategoryDto | null
}

/** A category as staff see it: its grants, the owner and the audit dates. */
export type AdminHelpCategoryDto = Omit<HelpCategoryDto, 'source'> & {
  owner: OwnerRef
  /** Who may read the category (`@frigear-nu/auth`): any one grant admits, an empty list admits nobody. */
  grants: Grant[]
  articleCount: number
  createdAt: string
  updatedAt: string
}

/** An article as staff see it: every status, its own grants and who changed it last. */
export type AdminHelpArticleDto = {
  id: string
  slug: string
  title: Translated
  body: Translated
  categoryId: string | null
  categorySlug: string
  /** The kind of its category. */
  kind: HelpCategoryKind
  status: HelpArticleStatus
  /** `null`: the article inherits its category. Otherwise it narrows the category. */
  grants: Grant[] | null
  icon: string | null
  links: HelpLink[]
  source: HelpSourceId
  /** Articles of a read-only source (Nuxt Content) cannot be edited in admin. */
  readOnly: boolean
  sort: number
  publishedAt: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One article of a checklist, with whether the viewer read it. */
export type HelpChecklistItemDto = {
  articleId: string
  required: boolean
  read: boolean
  readAt: string | null
  article: HelpArticleSummaryDto
}

/** A checklist as the viewer sees it: the items they may read and what they have read. */
export type HelpChecklistDto = {
  id: string
  name: Translated
  operationId: string | null
  items: HelpChecklistItemDto[]
  readCount: number
  requiredCount: number
  requiredReadCount: number
  /** Every required item was read. */
  completed: boolean
}

export type AdminHelpChecklistItemDto = {
  id: string
  articleId: string
  required: boolean
  sort: number
  /** The article, when it still exists. */
  article: HelpArticleSummaryDto | null
  /** The item comes from the `checklist` frontmatter of a content article, not from the builder. */
  fromContent: boolean
}

export type AdminHelpChecklistDto = {
  id: string
  name: Translated
  operationId: string | null
  /** Who sees the checklist (`@frigear-nu/auth`); with an `operationId`, only people who take part in it too. */
  grants: Grant[]
  sort: number
  items: AdminHelpChecklistItemDto[]
  createdAt: string
  updatedAt: string
}

/** One person in the progress table of a checklist. */
export type HelpProgressRow = {
  user: { id: string, name: string | null, email: string | null }
  readCount: number
  requiredReadCount: number
  completed: boolean
  lastReadAt: string | null
}

export type HelpProgressSummary = {
  requiredCount: number
  totalCount: number
}

/** The result of `POST /api/admin/help-center/send`. */
export type HelpSendResult = {
  /** People the audience resolved to. */
  recipients: number
  emailed: number
  texted: number
  /** Push notifications that went out (through notify's push driver). */
  pushed: number
  /** Recipients that got nothing: they cannot read any of the articles, or have no address for the channels asked for. */
  skipped: number
}

/** The locales an article still lacks, by field, when it cannot be published. */
export type MissingTranslations = { field: 'title' | 'body', locales: string[] }[]

/**
 * The audience of `POST /api/admin/help-center/send`: explicit people and/or a grant list (`@frigear-nu/auth`). Each
 * grant kind lists its members, so the send reaches the union of `userIds` and every grant's members. `public` lists
 * nobody, so it cannot be sent to.
 */
export type HelpAudience = {
  grants?: Grant[]
  userIds?: string[]
}

// --- Sources -----------------------------------------------------------------------------------

/**
 * Who reads. `user` is `null` for an anonymous visitor (and for `?public=1`). `canRead` decides one record by its own
 * `grants`: for the caller of a request it is `grantsCanRead` (a `public` grant needs no sign-in, anything else goes
 * through `help-center:read` and its policy), for a send it is the recipient's grants match. It is cached per record
 * for the request.
 */
export type HelpReader = {
  user: { id: string | number } | null
  canRead: (record: { grants: unknown }) => Promise<boolean>
}

export type HelpSourceContext = {
  event: H3Event
  /** Who reads. A source decides its own records with `reader.canRead`. */
  reader: HelpReader
  requiredLocales: string[]
}

/** A category a source knows. `visible` says whether this reader may read it; hidden ones still claim their slug. */
export type HelpSourceCategory = Omit<HelpCategoryDto, 'kind'> & {
  visible: boolean
  /** `help` when left out: a source's own categories are help categories unless it says otherwise. */
  kind?: HelpCategoryKind
}

/** An article a source returns. `kind` is filled in from its category when the sources are merged. */
export type HelpSourceArticle = Omit<HelpArticleDto, 'kind'> & { kind?: HelpCategoryKind }

export type HelpSourceListContext = HelpSourceContext & {
  /** Only articles whose title or text contains this, in any language. */
  q?: string
  /** Only articles in the category with this slug. */
  category?: string
}

/**
 * Where articles come from. The database and Nuxt Content ship with the module; a host adds its own with
 * `registerHelpCenterSource`. A source returns published articles the viewer may read, and the merged list is
 * filtered by category grants, searched and read-tracked the same way for every source.
 */
export type HelpCenterSource = {
  id: HelpSourceId
  /** Read-only sources cannot be edited in admin. */
  readOnly: boolean
  /** The published articles the viewer may read. */
  list: (ctx: HelpSourceListContext) => Promise<HelpSourceArticle[]> | HelpSourceArticle[]
  /** One article by its URL name, when the viewer may read it. */
  get: (slug: string, ctx: HelpSourceContext) => Promise<HelpSourceArticle | undefined> | HelpSourceArticle | undefined
  /** One article by its id (read state and checklists store ids). Without it the list is searched. */
  getById?: (id: string, ctx: HelpSourceContext) => Promise<HelpSourceArticle | undefined> | HelpSourceArticle | undefined
  /** Every category the source knows, with whether the viewer may read it. */
  categories: (ctx: HelpSourceContext) => Promise<HelpSourceCategory[]> | HelpSourceCategory[]
}
