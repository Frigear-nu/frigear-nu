<script setup lang="ts">
const { authenticated, claims, logout } = useOAuth()
</script>

<template>
  <UApp>
    <UContainer class="py-8">
      <NuxtPage />
      <div
        v-if="authenticated"
        class="mt-8 flex flex-col gap-4"
      >
        <pre class="text-sm">{{ claims }}</pre>
        <UButton
          label="Sign out"
          color="neutral"
          variant="outline"
          @click="logout()"
        />
      </div>
    </UContainer>
  </UApp>
</template>
