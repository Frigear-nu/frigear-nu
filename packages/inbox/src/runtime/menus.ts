import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'
import { inboxAccess } from './access'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`).
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.inbox as { pages?: { admin?: string } } | undefined

  // The staff entry of the admin sidebar (`@frigear-nu/admin`); the pages and the API check access themselves, and a
  // person without a mailbox sees an empty list.
  if (config?.pages?.admin) {
    extendMenuItem('admin.nav', defineMenuItem({
      id: 'inbox-admin',
      label: 'Inbox',
      labelKey: 'inbox.menu.admin.label',
      description: 'Messages from the contact form, email, WhatsApp, Messenger and Instagram.',
      descriptionKey: 'inbox.menu.admin.description',
      icon: 'i-lucide-inbox',
      to: config.pages.admin,
      permission: inboxAccess.permissions.read,
      order: 15,
    }))
  }
})
