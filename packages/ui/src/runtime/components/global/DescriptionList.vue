<script setup lang="ts">
import type { DescriptionItem } from '../../types'

/**
 * Label/value rows for a detail card. Each row renders the slot named after its `key` (or `label`) when given,
 * otherwise `value`; empty values read `empty` ("Not set") in muted text. `align="end"` right-aligns the values.
 */
const props = withDefaults(defineProps<{
  items: DescriptionItem[]
  empty?: string
  loading?: boolean
  align?: 'start' | 'end'
}>(), {
  align: 'start',
})

const t = useUiT('patterns')
const emptyLabel = computed(() => props.empty ?? t('notSet', 'Not set'))
const isEmpty = (value: DescriptionItem['value']) => value === undefined || value === null || value === ''
</script>

<template>
  <dl
    class="grid gap-x-6 gap-y-3 text-sm"
    :class="align === 'end' ? 'grid-cols-[auto_1fr] items-center' : 'sm:grid-cols-[10rem_1fr]'"
  >
    <template
      v-for="item in items"
      :key="item.key ?? item.label"
    >
      <dt class="text-muted">
        {{ item.label }}
      </dt>
      <dd
        class="text-highlighted min-w-0 wrap-break-word"
        :class="align === 'end' && 'text-right'"
      >
        <USkeleton
          v-if="loading"
          class="h-4 w-24"
          :class="align === 'end' && 'ml-auto'"
        />
        <slot
          v-else
          :name="item.key ?? item.label"
          :item="item"
        >
          <span
            v-if="isEmpty(item.value)"
            class="text-dimmed"
          >{{ emptyLabel }}</span>
          <span
            v-else
            class="whitespace-pre-line"
          >{{ item.value }}</span>
        </slot>
      </dd>
    </template>
  </dl>
</template>
