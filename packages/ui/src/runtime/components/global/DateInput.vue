<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'

type ModelValue = Date | string | number | undefined

const props = withDefaults(
  defineProps<{
    type?: 'date' | 'string'
  }>(),
  {
    type: 'date',
  },
)

const modelValue = defineModel<ModelValue>()

// Safely parse whatever comes in -> Date | undefined, never "Invalid Date"
function toDate(v: ModelValue): Date | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

// Emit back in whatever shape the `type` prop asks for
function fromDate(d: Date | undefined): ModelValue {
  if (d === undefined) return props.type === 'string' ? '' : undefined
  return props.type === 'string' ? d.toISOString() : d
}

const dateValue = computed<Date | undefined>({
  get() {
    return toDate(modelValue.value)
  },
  set(value) {
    modelValue.value = fromDate(value)
  },
})

// If you're feeding Nuxt UI's UInputDate/UCalendar, they want CalendarDate, not Date
function toCalendarDate(d: Date): CalendarDate {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function fromCalendarDate(cd: CalendarDate): Date {
  return cd.toDate('UTC')
}

const calendarValue = computed<CalendarDate | undefined>({
  get() {
    const d = dateValue.value
    return d ? toCalendarDate(d) : undefined
  },
  set(value) {
    dateValue.value = value ? fromCalendarDate(value) : undefined
  },
})
</script>

<template>
  <UInputDate v-model="calendarValue">
    <template #trailing>
      <UPopover>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-calendar"
          aria-label="Select a date"
          class="px-0"
        />
        <template #content>
          <UCalendar
            v-model="calendarValue"
            class="p-2"
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
