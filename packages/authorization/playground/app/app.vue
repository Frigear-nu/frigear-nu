<script setup lang="ts">
const { user } = useUserSession()
const post = { userId: 1 }
</script>

<template>
  <div>
    <p>User: {{ user?.email ?? 'guest' }} ({{ user?.role }})</p>
    <Can
      :ability="editPost"
      :args="[post]"
    >
      <button>Edit post</button>
      <template #fallback>
        <span>Cannot edit</span>
      </template>
    </Can>
    <NuxtPage />
  </div>
</template>
