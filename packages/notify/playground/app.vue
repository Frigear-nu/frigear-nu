<template>
  <div>
    Nuxt module playground!
  </div>
</template>

<script setup>
const notify = useNotify()

setInterval(() => {
  notify.addNotification(defineUINotification({
    title: 'Success',
    message: 'This is a success notification!',
    type: 'success',
  }))
}, 5000)
</script>
