import { defineMenuSource } from '@frigear-nu/menu/utils'

// The `admin.nav` entry of the users admin page (see `module.ts`; only registered with `settings.admin`).
export default defineMenuSource((items) => {
  const adminPage = useRuntimeConfig().public.users?.pages?.admin
  if (adminPage) {
    items.push({
      id: 'users-admin',
      label: 'Users',
      labelKey: 'users.admin.nav.label',
      description: 'Manage the users of the system.',
      descriptionKey: 'users.admin.nav.description',
      icon: 'i-lucide-users',
      to: adminPage,
      order: 10,
    })
  }
})
