<script setup lang="ts">
defineOptions({ name: 'UsersNewMembersWidget' })

const t = useModuleT('users')
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const { data: members } = await useFetch<{ id: number, name: string, email: string, createdAt: string, subscription?: { planKey: string | null, status: string } | null }[]>('/api/admin/users/new-members', { default: () => [] })
</script>

<template>
  <AdminListCard
    :title="t('admin.newMembers.title', 'New members')"
    :description="t('admin.newMembers.description', 'Signed up in the last 30 days.')"
    :is-empty="!members?.length"
    :empty="t('admin.newMembers.empty', 'Nobody new yet.')"
    :to="adminPage"
    :to-label="t('admin.allUsers', 'All users')"
  >
    <li
      v-for="member in members"
      :key="member.id"
      class="flex items-center justify-between gap-4"
    >
      <span class="min-w-0 truncate">
        <NuxtLink
          v-if="adminPage"
          :to="`${adminPage.replace(/\/+$/, '')}/${member.id}`"
          class="text-highlighted font-medium hover:underline"
        >{{ member.name }}</NuxtLink>
        <span
          v-else
          class="text-highlighted font-medium"
        >{{ member.name }}</span>
        <span class="text-muted"> · {{ member.email }}</span>
        <UBadge
          v-if="member.subscription"
          class="ml-2"
          size="sm"
          variant="subtle"
          :color="['active', 'trialing'].includes(member.subscription.status) ? 'success' : 'neutral'"
          :label="member.subscription.planKey ?? member.subscription.status"
        />
      </span>
      <time class="text-muted shrink-0">{{ new Date(member.createdAt).toLocaleDateString() }}</time>
    </li>
  </AdminListCard>
</template>
