<script setup lang="ts">
import { useUiT } from '../../composables/useTranslatedLocales'

/**
 * A small muted line under data that could not be refreshed: the request failed (offline, the server down) while the
 * last response stays on screen. Renders nothing without `error`. Put it in the branch that shows the data; with
 * nothing to show, render the error state instead.
 *
 * ```vue
 * <UEmpty v-if="error && !items.length" ... />
 * <div v-else>
 *   <StaleDataNotice :error="error" :refresh="refresh" />
 *   ...
 * </div>
 * ```
 */
const props = defineProps<{
  /** The request's error: the notice shows while it is set. */
  error: unknown
  /** Asks again; adds a "Try again" link. */
  refresh?: () => unknown
}>()

const t = useUiT('patterns')
</script>

<template>
  <p
    v-if="props.error"
    class="text-muted flex items-center gap-1.5 text-xs"
    role="status"
    data-stale-notice
  >
    <UIcon
      name="i-lucide-cloud-off"
      class="size-3.5 shrink-0"
    />
    <span>{{ t('staleData', 'Could not refresh. Showing the last saved data.') }}</span>
    <UButton
      v-if="props.refresh"
      variant="link"
      color="neutral"
      size="xs"
      class="p-0"
      :label="t('tryAgain', 'Try again')"
      @click="props.refresh()"
    />
  </p>
</template>
