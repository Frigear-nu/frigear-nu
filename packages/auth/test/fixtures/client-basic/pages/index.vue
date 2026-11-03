<script setup lang="ts">
const { loggedIn } = useUserSession()
</script>

<template>
  <p>Fixture home {{ loggedIn ? 'signed in' : 'signed out' }}</p>
</template>
