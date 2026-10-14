<script setup lang="ts">
import { renderSVG } from 'uqr'
import { useIntervalFn } from '@vueuse/core'

const t = useModuleT('account.frigearId')
const { user } = useUserSession()
const { data, refresh, status, error } = useFetch<{ payload: string, expiresIn: number }>('/api/account/id-code', { server: false })

const remaining = ref(0)
watch(data, (value) => {
  remaining.value = value?.expiresIn ?? 0
}, { immediate: true })

const refreshing = computed(() => status.value === 'pending')
useIntervalFn(() => {
  if (!data.value || refreshing.value) return
  if (remaining.value <= 1) {
    remaining.value = 0
    refresh()
    return
  }
  remaining.value -= 1
}, 1000)

const svg = computed(() => data.value ? renderSVG(data.value.payload, { ecc: 'L', border: 1 }) : '')
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('error', 'Could not create your Frigear ID.')"
    />
    <template v-else-if="svg">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        class="size-60 rounded-md bg-white p-2 [&>svg]:size-full"
        v-html="svg"
      />
      <UBadge
        color="warning"
        class="text-xl font-bold"
      >
        {{ t('expiresIn', 'Refreshes in {time}s').replace('{time}', String(remaining)) }}
      </UBadge>
      <div class="flex flex-wrap justify-center gap-2">
        <UBadge
          v-if="user"
          size="lg"
        >
          Frigear ID: {{ user.id }}
        </UBadge>
      </div>
    </template>
    <UIcon
      v-else
      name="i-lucide-refresh-cw"
      class="size-6 animate-spin"
    />
    <UButton
      icon="i-lucide-refresh-cw"
      variant="subtle"
      :loading="refreshing"
      :label="t('refresh', 'Refresh')"
      @click="refresh()"
    />
  </div>
</template>
