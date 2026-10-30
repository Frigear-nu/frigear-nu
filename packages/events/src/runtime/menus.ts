import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.events as { pages?: { tickets?: string, admin?: string } } | undefined

  if (config?.pages?.tickets) {
    extendMenuItem('account', defineMenuItem({
      id: 'event-tickets',
      label: 'Tickets',
      labelKey: 'events.menu.tickets.label',
      description: 'Your event tickets.',
      descriptionKey: 'events.menu.tickets.description',
      icon: 'i-lucide-ticket',
      to: config.pages.tickets,
      order: 40,
    }))
  }

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API stay gated by `events:authorize`.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'events-admin',
      label: 'Events',
      labelKey: 'events.menu.admin.label',
      description: 'Manage events, ticket types and attendees.',
      descriptionKey: 'events.menu.admin.description',
      icon: 'i-lucide-calendar-days',
      to: config.pages.admin,
      order: 20,
    }))
  }
})
