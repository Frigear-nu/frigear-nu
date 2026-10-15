<script setup lang="ts">
import { tablePageRange } from '../../utils/table'

/**
 * The footer of a paginated list, inside `TableCard #footer`: "21–40 of 132", rows per page and the pages. Pages
 * and the page-size select hide while everything fits on one page. Changing the page size goes back to page 1.
 */
const props = withDefaults(defineProps<{
  total: number
  pageSizes?: number[]
}>(), {
  pageSizes: () => [20, 50, 100],
})

const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 20 })

const t = useUiT('patterns')
const range = computed(() => tablePageRange(page.value, pageSize.value, props.total))
const sizes = computed(() => [...new Set([...props.pageSizes, pageSize.value])].sort((a, b) => a - b))
const paged = computed(() => props.total > Math.min(...sizes.value))
const pages = computed(() => props.total > pageSize.value || page.value > 1)

function setPageSize(value: number) {
  pageSize.value = Number(value)
  page.value = 1
}
</script>

<template>
  <div class="flex w-full flex-wrap items-center justify-between gap-3">
    <p class="tabular-nums">
      <slot :range="range">
        {{ range.to
          ? t('range', '{from}–{to} of {total}', { from: range.from, to: range.to, total })
          : t('noRows', 'No rows') }}
      </slot>
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <label
        v-if="paged"
        class="flex items-center gap-2"
      >
        <span class="max-sm:sr-only">{{ t('rowsPerPage', 'Rows per page') }}</span>
        <USelect
          :model-value="pageSize"
          :items="sizes"
          size="sm"
          class="w-20"
          @update:model-value="setPageSize"
        />
      </label>
      <UPagination
        v-if="pages"
        v-model:page="page"
        :items-per-page="pageSize"
        :total="total"
        :sibling-count="1"
        size="sm"
      />
    </div>
  </div>
</template>
