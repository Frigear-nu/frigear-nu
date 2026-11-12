<script setup lang="ts">
const session = useUserSession()
const own = computed(() => ({ ownerId: Number(session.user.value?.id ?? 0) }))
</script>

<template>
  <div>
    <Can permission="reports:write">
      <span>can-write</span>
      <template #fallback>
        <span>cannot-write</span>
      </template>
    </Can>
    <Can
      permission="reports:read"
      :record="own"
    >
      <span>can-read-own</span>
    </Can>
    <Can
      permission="reports:read"
      :record="{ ownerId: -1 }"
    >
      <span>can-read-other</span>
    </Can>
    <Cannot permission="member-area:view">
      <span>not-a-member</span>
    </Cannot>
  </div>
</template>
