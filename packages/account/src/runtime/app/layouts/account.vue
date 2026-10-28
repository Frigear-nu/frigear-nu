<script setup lang="ts">
// The account area: the shared dashboard shell (`AppShell` from @frigear-nu/ui), the same chrome as the admin area.
// The sidebar lists the `account` menu (or the enabled pages without the menu module) and ends with "Back to the site"
// and the account menu, the one place the signed-in identity is shown. Pages render their own heading
// (`AccountHeader` or `PageHeading`); paths are passed raw, the shell localises them.
defineOptions({ name: 'AccountLayout' })

const t = useModuleT('account')
const home = useRuntimeConfig().public.account?.pages?.index ?? '/account'
const { links } = await useAccountNav()
</script>

<template>
  <AppShell
    id="account"
    :title="t('title', 'Account')"
    :home="home"
    icon="i-lucide-user-round"
    :navigation="[links]"
    :nav-label="t('nav.label', 'Account navigation')"
    :back-to="{ to: '/', label: t('backToSite', 'Back to the site') }"
  >
    <template #sidebar-footer="{ collapsed }">
      <AccountMenu
        block
        :collapsed="collapsed"
      />
    </template>

    <div class="flex flex-col gap-4">
      <slot />
    </div>
  </AppShell>
</template>
