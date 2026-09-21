<script setup lang="ts">
type Unit = 'minutes' | 'hours' | 'days'

const UNIT_SECONDS: Record<Unit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
}

const units: { label: string, value: Unit }[] = [
  { label: 'Minutes', value: 'minutes' },
  { label: 'Hours', value: 'hours' },
  { label: 'Days', value: 'days' },
]

const seconds = defineModel<number>({ default: 86400 })

const unit = ref<Unit>('days')
const amount = ref<number>(1)

function secondsToUnit(secs: number, u: Unit): number {
  return Math.round(secs / UNIT_SECONDS[u])
}

function bestUnit(secs: number): Unit {
  if (secs % UNIT_SECONDS.days === 0) return 'days'
  if (secs % UNIT_SECONDS.hours === 0) return 'hours'
  return 'minutes'
}

watch(seconds, (secs) => {
  const u = bestUnit(secs)
  unit.value = u
  amount.value = secondsToUnit(secs, u)
}, { immediate: true })

function onUpdate() {
  const minSeconds = 60
  const raw = (amount.value || 1) * UNIT_SECONDS[unit.value]
  seconds.value = Math.max(minSeconds, raw)
}
</script>

<template>
  <div class="flex gap-2 w-full">
    <UInputNumber
      v-model="amount"
      class="flex-1"
      :min="1"
      @update:model-value="onUpdate"
    />
    <USelectMenu
      v-model="unit"
      :items="units"
      value-key="value"
      class="w-32"
      @update:model-value="onUpdate"
    />
  </div>
</template>
