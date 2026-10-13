<script setup lang="ts">
defineOptions({ name: 'AuthCard' })

defineProps<{
  title: string
  description?: string
}>()

// Apps brand the pages through `app.config.ts`: `users: { authLogo: '/logo.png' }` or `{ light, dark }` image paths.
const logo = useAppConfig().users?.authLogo as string | { light: string, dark: string } | undefined
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-var(--ui-header-height,4rem))] flex-col items-center justify-center gap-6 py-12 sm:py-16">
    <template v-if="logo">
      <img
        v-if="typeof logo === 'string'"
        :src="logo"
        alt=""
        class="h-16 w-auto"
      >
      <template v-else>
        <img
          :src="logo.light"
          alt=""
          class="h-16 w-auto dark:hidden"
        >
        <img
          :src="logo.dark"
          alt=""
          class="hidden h-16 w-auto dark:block"
        >
      </template>
    </template>

    <UPageCard
      class="w-full max-w-md"
      variant="outline"
    >
      <div class="flex flex-col gap-5">
        <div class="flex flex-col items-center gap-1.5 text-center">
          <h1 class="text-xl font-semibold text-highlighted">
            {{ title }}
          </h1>
          <div
            v-if="description || $slots.description"
            class="text-sm text-muted"
          >
            <slot name="description">
              {{ description }}
            </slot>
          </div>
        </div>

        <slot />

        <div
          v-if="$slots.footer"
          class="text-center text-sm text-muted"
        >
          <slot name="footer" />
        </div>
      </div>
    </UPageCard>
  </UContainer>
</template>
