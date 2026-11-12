<script lang="ts" setup generic="R">
import type { Permission } from '@frigear-nu/auth/access'
import { useAuthorization } from '../composables/useAuthorization'
import { computed } from '#imports'

// Renders the default slot when the visitor holds `permission` (and the shared policies allow `record`), else the
// `fallback` slot. For what the UI shows: the API decides what is allowed.
const props = defineProps<{
  /** A registered permission (`events:update`). */
  permission: Permission
  /** The record shared policies decide on. */
  record?: R
}>()

const { can } = useAuthorization()
const allowed = computed(() => can(props.permission, props.record))
</script>

<template>
  <slot v-if="allowed" />
  <slot
    v-else
    name="fallback"
  />
</template>
