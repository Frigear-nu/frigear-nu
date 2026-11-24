import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { eventsAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.events as { pages?: { tickets?: string, admin?: string }, ticketsMenu?: string } | undefined

  // The caller's tickets: an area of the signed-in hub (`dashboard` menu) when the page is there, else in the account.
  if (config?.pages?.tickets) {
    const hub = config.ticketsMenu === 'dashboard'
    extendMenuItem(hub ? 'dashboard' : 'account', defineMenuItem({
      id: 'event-tickets',
      label: 'Tickets',
      labelKey: 'events.menu.tickets.label',
      description: 'Your event tickets.',
      descriptionKey: 'events.menu.tickets.description',
      icon: 'i-lucide-ticket',
      to: config.pages.tickets,
      order: hub ? 30 : 40,
    }))
  }

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `events:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'events-admin',
      label: 'Events',
      labelKey: 'events.menu.admin.label',
      description: 'Manage events, ticket types and attendees.',
      descriptionKey: 'events.menu.admin.description',
      icon: 'i-lucide-calendar-days',
      to: config.pages.admin,
      permission: eventsAccess.permissions.manage,
      order: 20,
    }))
  }
})
