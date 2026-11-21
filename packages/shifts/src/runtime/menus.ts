import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.shifts as { pages?: { shifts?: string } } | undefined

  // A volunteer's own shifts, in the account menu.
  if (config?.pages?.shifts) {
    extendMenuItem('account', defineMenuItem({
      id: 'shifts-mine',
      label: 'My shifts',
      labelKey: 'shifts.menu.mine.label',
      description: 'Your shifts, your QR pass and swaps.',
      descriptionKey: 'shifts.menu.mine.description',
      icon: 'i-lucide-calendar-clock',
      to: config.pages.shifts,
      order: 43,
    }))
  }
})
