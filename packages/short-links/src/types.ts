import type { H3Event } from 'h3'

/** Who a short link belongs to: the module that made it and, optionally, the record it is for (a campaign id). */
export type ShortLinkOwner = {
  /** The owning module, e.g. `campaigns`. Links made by hand on the admin page belong to `short-links`. */
  module: string
  /** The owning record, e.g. a campaign id. */
  refId?: string | null
}

/** A short link as stored (dates as `Date`), what the server utils and the `short-links:clicked` hook hand out. */
export type ShortLink = {
  id: string
  code: string
  url: string
  owner: ShortLinkOwner
  title: string | null
  track: boolean
  expiresAt: Date | null
  /** Deleted by the retention task once it has been expired or disabled for `retention.deleteAfterDays`. */
  autoDelete: boolean
  disabledAt: Date | null
  clicks: number
  lastClickedAt: Date | null
  createdBy: number | null
  createdAt: Date
  updatedAt: Date
}

/** What `createShortLink` / `createShortLinks` take. */
export type CreateShortLinkInput = {
  /** The target; only `http:` and `https:` URLs are accepted. */
  url: string
  owner: ShortLinkOwner
  /** A vanity code (letters, digits, `-` and `_`, 3 to 64 characters). Omit for a random 7 character code. */
  code?: string
  title?: string | null
  /** Store a row per click (`short_link_clicks`). The counter and the hook work either way. Defaults to `true`. */
  track?: boolean
  /** After this the link answers 404. Set it on links that are only needed for a while, such as one per recipient. */
  expiresAt?: Date | string | null
  /**
   * Delete the link and its click rows once it has been expired or disabled for `retention.deleteAfterDays`, so
   * links nobody needs any more do not pile up. Defaults to `false`.
   */
  autoDelete?: boolean
  /** The user who made it, if any. */
  createdBy?: number | null
}

/** What the `short-links:clicked` Nitro hook receives. */
export type ShortLinkClickedContext = {
  event: H3Event
  /** The link as it was before this click was counted. */
  link: ShortLink
  /** The opaque last path segment of `/<path>/:code/:subject`, e.g. a campaign delivery token; `null` without one. */
  subject: string | null
}

/** A short link on the admin API (`/api/admin/short-links`). */
export type ShortLinkDto = {
  id: string
  code: string
  url: string
  /** The absolute short URL (`shortLinkUrl(link)`). */
  shortUrl: string
  owner: ShortLinkOwner
  title: string | null
  track: boolean
  expiresAt: string | null
  autoDelete: boolean
  disabledAt: string | null
  clicks: number
  lastClickedAt: string | null
  createdAt: string
  updatedAt: string
  /** Made on the admin page (owner `short-links`): only those can be edited there; other modules' links only disabled. */
  editable: boolean
}

export type ShortLinksPage = {
  items: ShortLinkDto[]
  total: number
  page: number
  pageSize: number
}

export type ModuleOptions = {
  /** The path the redirect lives under: `/l` gives `/l/:code` and `/l/:code/:subject`. Defaults to `/l`. */
  path?: string
  /**
   * The origin short URLs are built on, for a separate short domain that points at this app (`https://frg.nu`).
   * Defaults to the site URL (`runtimeConfig.public.siteUrl`); `NUXT_SHORT_LINKS_BASE_URL` at runtime.
   */
  baseUrl?: string
  /** How long rows of `short_link_clicks` are kept; the counter on the link stays. */
  retention?: {
    /** Days to keep click rows. Defaults to 365; `false` keeps them forever (no task is scheduled). */
    days?: number | false
    /**
     * Days a link with `autoDelete` stays after it expired or was disabled, before the task deletes it. Defaults to
     * 30, so a link disabled by mistake can still be enabled again.
     */
    deleteAfterDays?: number
    /** Cron of the `short-links:retention` task. Defaults to `15 4 * * *`; `false` registers it without a schedule. */
    cron?: string | false
  }
  settings?: {
    pages?: {
      /** Staff list of every short link (needs `short-links:manage`). `true` = `/admin/short-links`. On by default with `@frigear-nu/admin`; `false` turns it off. */
      admin?: string | boolean
    }
  }
}

export type ShortLinksRuntimeConfig = {
  path: string
  baseUrl: string
  retention: { days: number | false, deleteAfterDays: number }
}

export type PublicModuleOptions = {
  path: string
  /** `retention.deleteAfterDays`, for the admin form's hint. */
  deleteAfterDays: number
  pages: { admin?: string }
}
