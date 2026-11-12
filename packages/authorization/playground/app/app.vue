<script setup lang="ts">
const { user } = useUserSession()
const { access } = useAuthorization()
const post = { userId: 1 }
</script>

<template>
  <div>
    <p>User: {{ user?.email ?? 'guest' }} ({{ access?.roles?.join(', ') || 'no roles' }})</p>
    <Can
      permission="posts:update"
      :record="post"
    >
      <button>Edit post</button>
      <template #fallback>
        <span>Cannot edit</span>
      </template>
    </Can>
    <NuxtPage />
  </div>
</template>
