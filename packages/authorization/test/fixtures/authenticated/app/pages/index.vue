<script setup lang="ts">
const post = { userId: 1 }
</script>

<template>
  <div>
    <Can
      :ability="editPost"
      :args="[post]"
    >
      <span>can-edit</span>
      <template #fallback>
        <span>cannot-edit</span>
      </template>
    </Can>
  </div>
</template>
