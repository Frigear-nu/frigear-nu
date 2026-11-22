import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.crew as { pages?: { status?: string } } | undefined

  // A volunteer's own crew status, in the account menu.
  if (config?.pages?.status) {
    extendMenuItem('account', defineMenuItem({
      id: 'crew-status',
      label: 'My crew',
      labelKey: 'crew.menu.status.label',
      description: 'Your applications and crew places.',
      descriptionKey: 'crew.menu.status.description',
      icon: 'i-lucide-hand-heart',
      to: config.pages.status,
      order: 42,
    }))
  }
})
