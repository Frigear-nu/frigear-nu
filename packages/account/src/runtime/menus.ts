import { defineMenuItem, defineMenuSource, extendMenuItem } from '@frigear-nu/menu/utils'

// Only registered when `@frigear-nu/menu` is installed (see `module.ts`), so the import above
// is always resolvable when this file actually runs.
export default defineMenuSource(() => {
  const config = useRuntimeConfig().public.account

  if (config?.pages?.index) {
    extendMenuItem('account.dropdown', {
      id: 'account',
      label: 'Account',
      labelKey: 'account.menu.account.label',
      description: 'Your account.',
      descriptionKey: 'account.menu.account.description',
      icon: 'i-lucide-layout-dashboard',
      to: config.pages.index,
      order: -99,
    })
  }

  if (config?.pages?.profile) {
    const profileItem = defineMenuItem({
      id: 'profile',
      label: 'Profile',
      labelKey: 'account.menu.profile.label',
      description: 'Manage your profile details and email address.',
      descriptionKey: 'account.menu.profile.description',
      icon: 'i-lucide-user-round-pen',
      to: config.pages.profile,
      order: 10,
    })

    extendMenuItem('account', profileItem)
    extendMenuItem('account.dropdown', profileItem)
  }

  if (config?.pages?.security) {
    extendMenuItem('account', {
      id: 'security',
      label: 'Security',
      labelKey: 'account.menu.security.label',
      description: 'Change your password and manage passkeys.',
      descriptionKey: 'account.menu.security.description',
      icon: 'i-lucide-shield-user',
      to: config.pages.security,
      order: 20,
    })
  }

  if (config?.pages?.apiTokens) {
    extendMenuItem('account', {
      id: 'api-tokens',
      label: 'API tokens',
      labelKey: 'account.menu.apiTokens.label',
      description: 'Create tokens for scripts and tools.',
      descriptionKey: 'account.menu.apiTokens.description',
      icon: 'i-lucide-key-round',
      to: config.pages.apiTokens,
      order: 25,
    })
  }

  if (config?.pages?.documents) {
    extendMenuItem('account', {
      id: 'documents',
      label: 'Documents',
      labelKey: 'account.menu.documents.label',
      description: 'Handbooks and other files for you.',
      descriptionKey: 'account.menu.documents.description',
      icon: 'i-lucide-files',
      to: config.pages.documents,
      order: 30,
    })
  }

  if (config?.pages?.idCode) {
    extendMenuItem('account', {
      id: 'id-code',
      label: 'Frigear ID',
      labelKey: 'account.identificationCode.title',
      description: 'Press here to show your ID.',
      descriptionKey: 'account.identificationCode.description',
      icon: 'i-lucide-qr-code',
      to: config.pages.idCode,
      order: 5,
    })
  }
})
