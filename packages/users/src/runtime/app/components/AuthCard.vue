<script setup lang="ts">
defineOptions({ name: 'UsersAuthCard' })

defineProps<{
  title: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-var(--ui-header-height,4rem))] items-center justify-center py-12">
    <UPageCard
      class="w-full max-w-md"
      variant="subtle"
    >
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <UIcon
            v-if="icon"
            :name="icon"
            class="size-8 text-primary"
          />
          <h1 class="text-xl font-semibold text-highlighted">
            {{ title }}
          </h1>
          <p
            v-if="description"
            class="text-sm text-muted"
          >
            {{ description }}
          </p>
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
