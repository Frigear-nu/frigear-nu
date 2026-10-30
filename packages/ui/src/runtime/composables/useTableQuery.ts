import type { Ref } from 'vue'
import type { TableSortState } from '../utils/table'
import { computed, getCurrentInstance, onBeforeUnmount, reactive, ref, useRoute, useRouter, watch } from '#imports'

export interface TableQueryOptions<F extends Record<string, string>> {
  /** Rows per page when the URL has none. */
  pageSize?: number
  /** The sort when the URL has none; `null` for unsorted. */
  sort?: TableSortState | null
  /** Filters and their defaults; a filter at its default is left out of the URL. */
  filters?: F
  /** How long typing in the search waits before `q` follows, in ms. */
  debounce?: number
}

const single = (value: unknown): string | undefined => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first !== '' ? first : undefined
}
const positive = (value: unknown, fallback: number) => {
  const number = Number(single(value))
  return Number.isInteger(number) && number > 0 ? number : fallback
}

/**
 * The state of a paginated list (page, page size, search, sort, filters), kept in the URL so a list can be linked,
 * reloaded and navigated back to. `search` is what the input binds; `q` follows it after a short pause, so the API
 * is not hit on every keystroke. Any change to the search, a filter, the sort or the page size goes back to page 1.
 *
 * ```ts
 * const list = useTableQuery({ sort: { id: 'createdAt', desc: true }, filters: { role: 'all' } })
 * const sort = useTableSort(null, list.sort)
 * const { data } = await useFetch('/api/things', { query: list.query })
 * ```
 */
export function useTableQuery<F extends Record<string, string> = Record<string, never>>(options: TableQueryOptions<F> = {}) {
  const route = useRoute()
  const router = useRouter()
  const defaultPageSize = options.pageSize ?? 20
  const defaultSort = options.sort ?? null
  const defaultFilters = (options.filters ?? {}) as F

  const readSort = (): TableSortState | null => {
    const id = single(route.query.sort)
    if (!id) return defaultSort
    if (id === '-') return null
    return { id, desc: single(route.query.order) === 'desc' }
  }

  const page = ref(positive(route.query.page, 1))
  const pageSize = ref(positive(route.query.pageSize, defaultPageSize))
  const q = ref(single(route.query.q) ?? '')
  const search = ref(q.value)
  const sort = ref<TableSortState | null>(readSort()) as Ref<TableSortState | null>
  const filters = reactive(Object.fromEntries(
    Object.entries(defaultFilters).map(([key, fallback]) => [key, single(route.query[key]) ?? fallback]),
  )) as F

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(search, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      q.value = value.trim()
    }, options.debounce ?? 300)
  })
  if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(timer))

  watch([q, pageSize, sort, () => ({ ...filters })], () => {
    page.value = 1
  }, { deep: true })

  /** The list's own query keys, as they go into the URL. */
  const urlQuery = computed(() => {
    const sameSort = sort.value?.id === defaultSort?.id && sort.value?.desc === defaultSort?.desc
    return {
      page: page.value > 1 ? String(page.value) : undefined,
      pageSize: pageSize.value !== defaultPageSize ? String(pageSize.value) : undefined,
      q: q.value || undefined,
      sort: sameSort ? undefined : (sort.value?.id ?? '-'),
      order: sameSort || !sort.value ? undefined : (sort.value.desc ? 'desc' : 'asc'),
      ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value === defaultFilters[key] ? undefined : value])),
    }
  })

  watch(urlQuery, (value) => {
    const next = Object.entries({ ...route.query, ...value }).filter(([, entry]) => entry !== undefined)
    router.replace({ query: Object.fromEntries(next) })
  })

  /** What a server-paginated list sends: filters at their default are left out. */
  const query = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    q: q.value || undefined,
    sort: sort.value?.id,
    order: sort.value ? (sort.value.desc ? 'desc' as const : 'asc' as const) : undefined,
    ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value === defaultFilters[key] ? undefined : value])),
  }))

  /** Whether the search or any filter narrows the list. */
  const filtered = computed(() => !!search.value || Object.entries(filters).some(([key, value]) => value !== defaultFilters[key]))

  /** Clears the search and puts every filter back to its default. */
  function reset() {
    search.value = ''
    q.value = ''
    Object.assign(filters, defaultFilters)
  }

  return { page, pageSize, search, q, sort, filters, query, filtered, reset }
}
