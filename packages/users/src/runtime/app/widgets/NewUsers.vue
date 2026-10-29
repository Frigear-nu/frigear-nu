<script setup lang="ts">
import { usersApi } from '../../utils/api'
import type { UserRow } from '../utils/admin-user'

defineOptions({ name: 'UsersNewUsersWidget' })

const t = useModuleT('users')
const format = useFormat()
const { localize } = useLocaleLink()
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const listPath = adminPage ? localize(adminPage.replace(/\/+$/, '')) : undefined
const { data: users, status } = useLazyFetch<UserRow[]>(usersApi.admin.new, { key: 'admin-users-new', default: () => [] })
</script>

<template>
  <ListCard
    :title="t('admin.newUsers.title', 'New users')"
    :description="t('admin.newUsers.description', 'Signed up in the last 30 days.')"
    :loading="status === 'pending' && !users?.length"
    :is-empty="!users?.length"
    :empty="t('admin.newUsers.empty', 'Nobody new yet.')"
    :to="listPath"
    :to-label="t('admin.allUsers', 'All users')"
  >
    <li
      v-for="user in users"
      :key="user.id"
      class="flex items-center justify-between gap-4"
    >
      <span class="min-w-0 truncate">
        <NuxtLink
          v-if="listPath"
          :to="`${listPath}/${user.id}`"
          class="text-highlighted font-medium hover:underline"
        >{{ user.name }}</NuxtLink>
        <span
          v-else
          class="text-highlighted font-medium"
        >{{ user.name }}</span>
        <span class="text-muted"> · {{ user.email }}</span>
        <UBadge
          v-if="user.subscription"
          class="ml-2"
          size="sm"
          variant="subtle"
          :color="statusColor(user.subscription.status)"
          :label="user.subscription.planKey ?? user.subscription.status"
        />
      </span>
      <time class="text-muted shrink-0">{{ format.date(user.createdAt) }}</time>
    </li>
  </ListCard>
</template>
