import type { H3Event } from 'h3'

/** A text that is either one string or a map of locale -> string. */
export type Translated = string | Record<string, string>

export type DocumentKind = 'folder' | 'file'
/** `everyone`: every signed-in user. `groups`: only members of the shared groups (nobody, until shared). */
export type DocumentAudience = 'everyone' | 'groups'

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** The page signed-in users browse documents on. `true` registers `/account/documents`. */
      documents?: string | boolean
      /** Document management. `true` registers `/admin/documents`. */
      admin?: string | boolean
    }
    /** Largest accepted upload in bytes. Defaults to 25 MB. */
    maxFileSize?: number
    /** Accepted MIME types or `type/*` wildcards. Defaults to PDF, plain text, images and common office files. */
    accept?: string[]
  }
}

export type PublicModuleOptions = {
  pages: { documents?: string, admin?: string }
}

export type DocumentsRuntimeConfig = {
  maxFileSize: number
  accept: string[]
}

export type AuthorizeContext = {
  event: H3Event
  userId: number
  /** Set to `true` to let the user manage documents (and see all of them). Denied by default. */
  allowed: boolean
}

/** What a signed-in user sees. */
export type DocumentDto = {
  id: string
  parentId: string | null
  kind: DocumentKind
  title: Translated
  description: Translated | null
  icon: string | null
  filename: string | null
  contentType: string | null
  size: number | null
}

/** What managers see: the public fields plus who it is shared with. */
export type AdminDocumentDto = DocumentDto & {
  sortOrder: number
  audience: DocumentAudience
  groupIds: string[]
  createdAt: string
  updatedAt: string
}

export type DocumentListing<T extends DocumentDto = DocumentDto> = {
  /** The folder being listed; `null` for the root. */
  folder: T | null
  /** Folders from the root down to (and including) `folder`. */
  breadcrumb: T[]
  items: T[]
}

export type GroupOptionDto = { id: string, slug: string, name: Translated }
