import type { H3Event } from 'h3'
import type { OwnerRef, Viewer, Visibility } from '@frigear-nu/audience'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated, Visibility, OwnerRef, Viewer }

/** `draft` articles are only seen by staff; `published` ones by everyone their visibility allows. */
export type HelpArticleStatus = 'draft' | 'published'

/** The id of a source: `database` and `content` ship with the module, a host registers more. */
export type HelpSourceId = string

export type ModuleOptions = {
  settings?: {
    pages?: {
      /**
       * The public area, for everyone, with public articles only. Defaults to `/help`; `false` turns it off. Category and
       * article pages follow below it: `<base>/:category` and `<base>/:category/:slug`.
       */
      public?: string | false
      /**
       * The signed-in area: public and restricted articles for the viewer, onboarding checklists with read state.
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
      /** Which source wins when a database article and a content article share a slug. Defaults to `database`. */
      precedence?: 'database' | 'content'
      /** What a missing required language in a content article does at build time. Defaults to `warn`. */
      missingLocales?: 'warn' | 'error'
    }
    /** Add a Help tab to the mobile app (needs `@frigear-nu/mobile`). On by default when mobile is installed. */
    mobileTab?: boolean
    /** Emit `Article` JSON-LD for public articles. On by default; `false` turns it off. */
    schema?: boolean
  }
}

export type PublicModuleOptions = {
  pages: {
    public?: string
    signedIn?: string
    admin?: string
    adminChecklist?: string
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
  /** `@frigear-nu/faq` is installed: categories can show FAQ groups. */
  faq: boolean
}

/** A category as the viewer who may read it sees it. */
export type HelpCategoryDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  parentId: string | null
  sort: number
  /** Anonymous visitors may read the category (`visibility.public`). */
  public: boolean
  source: HelpSourceId
  /** Slugs of `@frigear-nu/faq` groups shown in the category. */
  faqGroups: string[]
}

/** An article without its text: what lists show. */
export type HelpArticleSummaryDto = {
  id: string
  slug: string
  title: Translated
  categorySlug: string
  source: HelpSourceId
  /** Anonymous visitors may read the article (its category is public and it does not narrow that). */
  public: boolean
  sort: number
  publishedAt: string | null
  updatedAt: string | null
}

/** An article with its text. */
export type HelpArticleDto = HelpArticleSummaryDto & {
  /** Markdown or MDC, per locale. */
  body: Translated
}

/** One article with its category, what `GET /api/help-center/articles/:slug` answers. */
export type HelpArticleDetailDto = HelpArticleDto & {
  category: HelpCategoryDto | null
}

/** A category as staff see it: the visibility, the owner and the audit dates. */
export type AdminHelpCategoryDto = Omit<HelpCategoryDto, 'source'> & {
  owner: OwnerRef
  visibility: Visibility | null
  articleCount: number
  createdAt: string
  updatedAt: string
}

/** An article as staff see it: every status, the visibility of its own and who changed it last. */
export type AdminHelpArticleDto = {
  id: string
  slug: string
  title: Translated
  body: Translated
  categoryId: string | null
  categorySlug: string
  status: HelpArticleStatus
  visibility: Visibility | null
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
  visibility: Visibility | null
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
  /** Recipients that got nothing: they cannot read any of the articles, or have no address for the channels asked for. */
  skipped: number
}

/** The locales an article still lacks, by field, when it cannot be published. */
export type MissingTranslations = { field: 'title' | 'body', locales: string[] }[]

/** The audience of `POST /api/admin/help-center/send`. */
export type HelpAudience = {
  operationId?: string
  teamId?: string
  globalRoles?: string[]
  /** Explicit people, next to whatever the hook resolves. */
  userIds?: string[]
}

/** Context of `help-center:audience:resolve`. */
export type HelpAudienceResolveContext = {
  event: H3Event
  audience: HelpAudience
  /** Listeners add the ids of the people the audience (`teamId`, `operationId`, `globalRoles`) stands for. */
  userIds: string[]
}

// --- Sources -----------------------------------------------------------------------------------

export type HelpSourceContext = {
  event: H3Event
  /** Who is looking. An anonymous visitor has an empty viewer. */
  viewer: Viewer
  requiredLocales: string[]
}

/** A category a source knows. `visible` says whether this viewer may read it; hidden ones still claim their slug. */
export type HelpSourceCategory = HelpCategoryDto & { visible: boolean }

export type HelpSourceListContext = HelpSourceContext & {
  /** Only articles whose title or text contains this, in any language. */
  q?: string
  /** Only articles in the category with this slug. */
  category?: string
}

/**
 * Where articles come from. The database and Nuxt Content ship with the module; a host adds its own with
 * `registerHelpCenterSource`. A source returns published articles the viewer may read, and the merged list is
 * filtered by category visibility, searched and read-tracked the same way for every source.
 */
export type HelpCenterSource = {
  id: HelpSourceId
  /** Read-only sources cannot be edited in admin. */
  readOnly: boolean
  /** The published articles the viewer may read. */
  list: (ctx: HelpSourceListContext) => Promise<HelpArticleDto[]> | HelpArticleDto[]
  /** One article by its URL name, when the viewer may read it. */
  get: (slug: string, ctx: HelpSourceContext) => Promise<HelpArticleDto | undefined> | HelpArticleDto | undefined
  /** One article by its id (read state and checklists store ids). Without it the list is searched. */
  getById?: (id: string, ctx: HelpSourceContext) => Promise<HelpArticleDto | undefined> | HelpArticleDto | undefined
  /** Every category the source knows, with whether the viewer may read it. */
  categories: (ctx: HelpSourceContext) => Promise<HelpSourceCategory[]> | HelpSourceCategory[]
}
