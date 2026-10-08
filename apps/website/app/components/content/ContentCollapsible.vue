<script setup lang="ts">
// "Read more" block: a full-width toggle button that reveals the default slot.
withDefaults(defineProps<{
  label: string
  icon?: string
  defaultOpen?: boolean
}>(), {
  icon: 'i-lucide-info',
  defaultOpen: false,
})
</script>

<template>
  <UCollapsible
    :default-open="defaultOpen"
    :unmount-on-hide="false"
    class="flex flex-col gap-2 rounded-lg bg-primary/10 p-1"
  >
    <UButton
      block
      class="group"
      color="primary"
      variant="subtle"
      size="lg"
      :icon="icon"
      :label="label"
      trailing-icon="i-lucide-chevron-down"
      :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
    />
    <template #content>
      <div class="flex flex-col gap-4 p-3 text-left sm:p-4">
        <slot />
      </div>
    </template>
  </UCollapsible>
</template>
