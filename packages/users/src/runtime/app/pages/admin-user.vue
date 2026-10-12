<script setup lang="ts">
import OverviewTab from '../tabs/Overview.vue'
import type { AdminUserDetail } from '../utils/admin-user'

defineOptions({ name: 'UsersAdminUserPage' })

const t = useModuleT('users')
const route = useRoute()
const id = computed(() => route.params.id as string)
// The list lives one level up from `<list>/<id>`.
const listPath = computed(() => route.path.replace(/\/[^/]+\/?$/, ''))

const { data: user, refresh, error } = await useFetch<AdminUserDetail>(() => `/api/admin/users/${id.value}`)

// The page is a tab view over the `admin.users` area: modules add tabs with `extendTabs(nuxt, 'admin.users', ...)` and
// each tab component receives the `user` and may emit `refresh`. `@frigear-nu/widget` is optional; without it the
// built-in Overview tab renders on its own.
const Tabs = resolveComponent('WidgetTabs')
const tabs = typeof Tabs === 'string' ? undefined : Tabs
</script>

<template>
  <AdminPage>
    <template v-if="error || !user">
      <AdminPageHeader :back="{ label: t('admin.title', 'Users'), to: listPath }" />
      <UAlert
        color="error"
        variant="subtle"
        :title="t('admin.detail.notFound', 'User not found.')"
      />
    </template>
    <template v-else>
      <AdminPageHeader
        :title="user.name"
        :description="user.email"
        :back="{ label: t('admin.title', 'Users'), to: listPath }"
      >
        <template #links>
          <UBadge
            :color="user.emailVerifiedAt ? 'success' : 'warning'"
            variant="subtle"
            :label="user.emailVerifiedAt ? t('admin.filters.verified', 'Verified') : t('admin.filters.unverified', 'Unverified')"
          />
        </template>
      </AdminPageHeader>

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
  </AdminPage>
</template>
