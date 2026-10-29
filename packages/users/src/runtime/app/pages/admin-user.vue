<script setup lang="ts">
import OverviewTab from '../tabs/Overview.vue'
import { useUserActions } from '../composables/useUserActions'
import type { UserDetail } from '../utils/admin-user'

defineOptions({ name: 'UsersAdminUserPage' })

const t = useModuleT('users')
const route = useRoute()
const actions = useUserActions()
const id = computed(() => route.params.id as string)

const { data: user, refresh, error } = await useFetch<UserDetail>(() => `/api/admin/users/${id.value}`)
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))

// The page is a tab view over the `admin.users` area: modules add tabs with `extendTabs(nuxt, 'admin.users', ...)` and
// each tab component receives the `user` and may emit `refresh`. `@frigear-nu/widget` is optional; without it the
// built-in Overview tab renders on its own.
const Tabs = resolveComponent('WidgetTabs')
const tabs = typeof Tabs === 'string' ? undefined : Tabs

const menu = computed(() => user.value
  ? actions.menu(user.value, {
      open: false,
      can: user.value.can,
      onRemoved: async () => { await navigateTo(actions.listPath.value) },
    })
  : [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="error && error.statusCode !== 404"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to users') : t('admin.detail.loadFailed', 'The user could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="error || !user"
      icon="i-lucide-user-x"
      :title="t('admin.detail.notFound', 'User not found')"
      :description="t('admin.detail.notFoundHint', 'It may have been deleted.')"
      :actions="[{ label: t('admin.allUsers', 'All users'), to: actions.listPath.value, color: 'neutral', variant: 'outline' }]"
    />
    <template v-else>
      <PageHeading
        :title="user.name"
        :description="user.email"
        :breadcrumb="[{ label: t('admin.title', 'Users'), to: actions.listPath.value }, { label: user.name }]"
      >
        <template #badge>
          <StatusBadge
            :status="user.emailVerifiedAt ? 'verified' : 'unverified'"
            :colors="{ verified: 'success', unverified: 'warning' }"
            :label="user.emailVerifiedAt ? t('admin.filters.verified', 'Verified') : t('admin.filters.unverified', 'Unverified')"
          />
        </template>
        <template
          v-if="menu.length"
          #actions
        >
          <RowMenu
            :items="menu"
            :subject="user.name"
            variant="outline"
          />
        </template>
      </PageHeading>

      <component
        :is="tabs"
        v-if="tabs"
        name="admin.users"
        :context="{ user }"
        @refresh="refresh"
      />
      <OverviewTab
        v-else
        :user="user"
        @refresh="refresh"
      />
    </template>
  </div>
</template>
