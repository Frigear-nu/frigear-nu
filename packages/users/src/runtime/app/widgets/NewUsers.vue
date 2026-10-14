<script setup lang="ts">
defineOptions({ name: 'UsersNewUsersWidget' })

const t = useModuleT('users')
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const { data: users } = await useFetch<{ id: number, name: string, email: string, createdAt: string, subscription?: { planKey: string | null, status: string } | null }[]>('/api/admin/users/new', { default: () => [] })
</script>

<template>
  <AdminListCard
    :title="t('admin.newUsers.title', 'New users')"
    :description="t('admin.newUsers.description', 'Signed up in the last 30 days.')"
    :is-empty="!users?.length"
    :empty="t('admin.newUsers.empty', 'Nobody new yet.')"
    :to="adminPage"
    :to-label="t('admin.allUsers', 'All users')"
  >
    <li
      v-for="user in users"
      :key="user.id"
      class="flex items-center justify-between gap-4"
    >
      <span class="min-w-0 truncate">
        <NuxtLink
          v-if="adminPage"
          :to="`${adminPage.replace(/\/+$/, '')}/${user.id}`"
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
          :color="['active', 'trialing'].includes(user.subscription.status) ? 'success' : 'neutral'"
          :label="user.subscription.planKey ?? user.subscription.status"
        />
      </span>
      <time class="text-muted shrink-0">{{ new Date(user.createdAt).toLocaleDateString() }}</time>
    </li>
  </AdminListCard>
</template>
