import type { Translated } from '../../../types'

export type AdminAddon = {
  id: string
  label: Translated
  description: Translated | null
  price: number
  capacity: number | null
}

export type AdminAddonGroup = {
  id: string
  title: Translated
  required: boolean
  multiple: boolean
  addons: AdminAddon[]
}

export type AdminTicketType = {
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
  addonGroups: AdminAddonGroup[]
}

export type AdminEvent = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  body: Translated | null
  status: 'draft' | 'published' | 'archived'
  startsAt: string
  endsAt: string | null
  location: Translated | null
  ticketTypes: AdminTicketType[]
}

/** `datetime-local` inputs want the local time without a zone, not the stored ISO instant. */
export const toLocalInput = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** Runs an admin action with a shared busy flag, toasting the success message or the server's error. */
export function useAdminAction() {
  const t = useModuleT('events')
  const toast = useToast()
  const busy = ref(false)
  async function run(action: () => Promise<unknown>, success?: string) {
    busy.value = true
    try {
      await action()
      if (success) toast.add({ title: success, color: 'success' })
    }
    catch (cause) {
      toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
    }
    finally {
      busy.value = false
    }
  }
  return { busy, run }
}
