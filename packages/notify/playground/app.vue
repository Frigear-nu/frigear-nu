<template>
  <div>
    Nuxt module playground!
  </div>
</template>

<script setup>
const notify = useNotify()

if (import.meta.client) {
  setInterval(() => {
    notify.addNotification(defineUINotification({
      title: 'Success',
      text: 'This is a success notification!',
      type: 'success',
    }))
  }, 5000)
}
</script>
