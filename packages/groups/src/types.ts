import type { H3Event } from 'h3'

/** A text that is either one string or a map of locale -> string. */
export type Translated = string | Record<string, string>

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** Group list. `true` registers `/admin/groups`. */
      admin?: string | boolean
      /** One group with its members. `true` registers `/admin/groups/:id`. */
      adminGroup?: string | boolean
    }
  }
}

export type PublicModuleOptions = {
  pages: { admin?: string, adminGroup?: string }
}

export type AuthorizeContext = {
  event: H3Event
  userId: number
  /** Set to `true` to let the user manage groups. Denied by default. */
  allowed: boolean
}

export type GroupDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  icon: string | null
  memberCount: number
  createdAt: string
}

export type GroupMemberDto = {
  userId: number
  name: string
  email: string
  addedAt: string
}

export type GroupUserDto = { id: number, name: string, email: string }
