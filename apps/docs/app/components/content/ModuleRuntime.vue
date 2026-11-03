<script setup lang="ts">
// Where a module runs, shown under the intro of every module overview: `:module-runtime{server client}`.
const props = defineProps<{
  server?: boolean
  client?: boolean
  mobile?: boolean
}>()

const targets = computed(() => [
  { key: 'server', label: 'Server', icon: 'i-lucide-server', on: props.server },
  { key: 'client', label: 'Client', icon: 'i-lucide-monitor', on: props.client },
  { key: 'mobile', label: 'Mobile', icon: 'i-lucide-smartphone', on: props.mobile },
])
</script>

<template>
  <div class="not-prose my-4 flex flex-wrap gap-2">
    <UBadge
      v-for="target in targets"
      :key="target.key"
      :label="target.label"
      :icon="target.on ? target.icon : 'i-lucide-minus'"
      :color="target.on ? 'primary' : 'neutral'"
      :variant="target.on ? 'subtle' : 'outline'"
      :class="target.on ? undefined : 'opacity-50 line-through'"
      :title="target.on ? `Runs on ${target.label.toLowerCase()}` : `Not for ${target.label.toLowerCase()}`"
    />
  </div>
</template>
