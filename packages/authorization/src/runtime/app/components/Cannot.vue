<script lang="ts" setup generic="R">
import { useAuthorization } from '../composables/useAuthorization'
import { computed } from '#imports'

// Renders the default slot when the visitor does not hold `permission` (or a shared policy denies `record`).
const props = defineProps<{
  permission: string
  record?: R
}>()

const { cannot } = useAuthorization()
const denied = computed(() => cannot(props.permission, props.record))
</script>

<template>
  <slot v-if="denied" />
</template>
