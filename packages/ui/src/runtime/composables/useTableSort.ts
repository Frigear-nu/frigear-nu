import type { Ref } from 'vue'
import { UButton } from '#components'
import { nextTableSort, tableSortQuery, type TableSortState } from '../utils/table'
import { useUiT } from './useTranslatedLocales'

const SORT_ICONS = {
  none: 'i-lucide-arrow-up-down',
  asc: 'i-lucide-arrow-up-narrow-wide',
  desc: 'i-lucide-arrow-down-wide-narrow',
} as const

/**
 * Sortable column headers that look and behave the same in every list: a ghost button that cycles ascending,
 * descending, unsorted. `sorting` is in `UTable`'s shape, so a client-sorted list binds it with
 * `v-model:sorting`; a server-sorted list sends `query` (`{ sort, order }`) instead.
 *
 * ```ts
 * const sort = useTableSort({ id: 'createdAt', desc: true })
 * const columns = [{ accessorKey: 'name', header: sort.header('name', t('name', 'Name')) }]
 * ```
 *
 * Pass `state` to keep the sort somewhere else, such as the URL (see `useTableQuery`).
 */
export function useTableSort(initial: TableSortState | null = null, state?: Ref<TableSortState | null>) {
  const t = useUiT('patterns')
  const current = state ?? ref<TableSortState | null>(initial)

  const sorting = computed<TableSortState[]>({
    get: () => (current.value ? [current.value] : []),
    set: (value) => {
      current.value = value[0] ?? null
    },
  })
  const query = computed(() => tableSortQuery(current.value))

  function toggle(id: string) {
    current.value = nextTableSort(current.value, id)
  }

  /** The `header` of a sortable column. */
  function header(id: string, label: string) {
    return () => {
      const direction = current.value?.id === id ? (current.value.desc ? 'desc' : 'asc') : 'none'
      return h(UButton, {
        'label': label,
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'xs',
        'class': '-mx-2.5 text-xs font-normal text-muted data-[sorted=true]:text-highlighted',
        'data-sorted': direction !== 'none',
        'icon': SORT_ICONS[direction],
        'trailing': true,
        'aria-label': direction === 'none'
          ? t('sortBy', 'Sort by {column}', { column: label })
          : t(direction === 'asc' ? 'sortedAsc' : 'sortedDesc', direction === 'asc' ? 'Sort by {column}, now ascending' : 'Sort by {column}, now descending', { column: label }),
        'onClick': () => toggle(id),
      })
    }
  }

  return { sort: current, sorting, query, toggle, header }
}
