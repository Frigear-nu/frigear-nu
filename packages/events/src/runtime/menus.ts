import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.events as { pages?: { tickets?: string } } | undefined

  if (config?.pages?.tickets) {
    extendMenuItem('dashboard.account', defineMenuItem({
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
})
