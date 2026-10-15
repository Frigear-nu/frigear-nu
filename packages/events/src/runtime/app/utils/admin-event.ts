import type { Translated } from '../../../types'

export type StaffAddon = {
  id: string
  label: Translated
  description: Translated | null
  price: number
  capacity: number | null
}

export type StaffAddonGroup = {
  id: string
  title: Translated
  required: boolean
  multiple: boolean
  addons: StaffAddon[]
}

export type StaffTicketType = {
  id: string
  key: string
  name: Translated
  description: Translated | null
  price: number
  currency: string
  capacity: number | null
  saleStartsAt: string | null
  saleEndsAt: string | null
  requiresMembership: 'any' | string[] | null
  excludesMembership: 'any' | string[] | null
  addonGroups: StaffAddonGroup[]
}

export type StaffEvent = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  body: Translated | null
  status: 'draft' | 'published' | 'archived'
  startsAt: string
  endsAt: string | null
  location: Translated | null
  ticketTypes: StaffTicketType[]
}

/** The fields the event list shows; the full `StaffEvent` fits it too. */
export type StaffEventSummary = Pick<StaffEvent, 'id' | 'slug' | 'name' | 'status' | 'startsAt' | 'location'>

/** `datetime-local` inputs want the local time without a zone, not the stored ISO instant. */
export const toLocalInput = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
