import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'
import { useRuntimeConfig } from '#imports'

// The Settings entry of the roles admin (see `module.ts`; only registered with `@frigear-nu/admin`). Hidden from
// viewers without `roles:read`; the page and API check it themselves.
export default defineMenuSource(() => {
  const rolesPage = useRuntimeConfig().public.authorization?.pages?.roles
  if (rolesPage) {
    extendMenuItem('admin.nav.settings', defineMenuItem({
      id: 'authorization-roles',
      label: 'Roles & permissions',
      labelKey: 'authorization.admin.nav.label',
      description: 'The roles and what each may do.',
      descriptionKey: 'authorization.admin.nav.description',
      icon: 'i-lucide-shield-check',
      to: rolesPage,
      order: 20,
      permission: 'roles:read',
    }))
  }
})
