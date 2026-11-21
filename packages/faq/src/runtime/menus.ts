import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { faqAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.faq as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the page and API check `faq:manage` themselves.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'faq-admin',
      label: 'FAQ',
      labelKey: 'faq.menu.admin.label',
      description: 'Manage the questions and answers shown on the site and in the app.',
      descriptionKey: 'faq.menu.admin.description',
      icon: 'i-lucide-message-circle-question-mark',
      to: config.pages.admin,
      permission: faqAccess.permissions.manage,
      order: 35,
    }))
  }
})
