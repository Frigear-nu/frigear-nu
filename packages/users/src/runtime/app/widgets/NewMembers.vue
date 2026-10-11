<script setup lang="ts">
defineOptions({ name: 'UsersNewMembersWidget' })

const t = useModuleT('users')
const adminPage = useRuntimeConfig().public.users?.pages?.admin
const { data: members } = await useFetch<{ id: number, name: string, email: string, createdAt: string }[]>('/api/admin/users/new-members', { default: () => [] })
</script>

<template>
  <UPageCard
    variant="subtle"
    :title="t('admin.newMembers.title', 'New members')"
    :description="t('admin.newMembers.description', 'Signed up in the last 30 days.')"
  >
    <ul
      v-if="members?.length"
      class="divide-default divide-y"
    >
      <li
        v-for="member in members"
        :key="member.id"
        class="flex items-center justify-between gap-4 py-2 text-sm"
      >
        <span class="min-w-0 truncate">
          <span class="font-medium">{{ member.name }}</span>
          <span class="text-muted"> · {{ member.email }}</span>
        </span>
        <time class="text-muted shrink-0">{{ new Date(member.createdAt).toLocaleDateString() }}</time>
      </li>
    </ul>
    <p
      v-else
      class="text-muted text-sm"
    >
      {{ t('admin.newMembers.empty', 'Nobody new yet.') }}
    </p>
    <template
      v-if="adminPage"
      #footer
    >
      <UButton
        :to="adminPage"
        variant="outline"
        color="neutral"
        size="xs"
        trailing-icon="i-lucide-arrow-right"
        :label="t('admin.allUsers', 'All users')"
      />
    </template>
  </UPageCard>
</template>
