<template>
  TEST
</template>

<script setup lang="ts">
const notify = useNotify()

if (import.meta.client) {
  setInterval(() => {
    notify.addNotification({
      title: 'Success',
      text: 'This is a success notification!',
      type: 'success',
    })
  }, 5000)
}
</script>
