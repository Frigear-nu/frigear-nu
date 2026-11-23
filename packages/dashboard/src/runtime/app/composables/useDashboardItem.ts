import { computed, inject, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'

export interface DashboardItemContext {
  /** The dashboard's name. */
  dashboard: string
  /** The item's id. */
  id: string
  /** Set by the item while it loads: the frame shows a skeleton instead of an empty card. */
  loading: Ref<boolean>
  /** Set by the item when its data failed: the frame shows the error with a retry button. */
  error: Ref<unknown>
  /**
   * Set by the item when it has nothing to show this viewer (no apps, no mailbox): the frame, title included, is left
   * out of the grid until it has something, except while the user edits the layout.
   */
  empty: Ref<boolean>
  /** Whether the user collapsed the item. A collapsed item is not rendered. */
  collapsed: ComputedRef<boolean>
  /** The user's settings of this item (stored in their layout). */
  settings: ComputedRef<Record<string, unknown>>
  /** Replaces the user's settings of this item; an empty object clears them. */
  setSettings: (value: Record<string, unknown>) => Promise<void>
  /** Reloads the item: clears `error` and calls the handler registered with `onRefresh`. */
  refresh: () => Promise<void>
  /** Registers what `refresh()` (and the retry button) calls, such as the `refresh` of the item's `useFetch`. */
  onRefresh: (handler: () => unknown) => void
}

export const dashboardItemKey: InjectionKey<DashboardItemContext> = Symbol('dashboard-item')

/** A context for an item rendered outside a dashboard frame (a page of its own, a test): local state only. */
function standalone(): DashboardItemContext {
  let handler: (() => unknown) | undefined
  const error = ref<unknown>(null)
  const settings = ref<Record<string, unknown>>({})
  return {
    dashboard: '',
    id: '',
    loading: ref(false),
    error,
    empty: ref(false),
    collapsed: computed(() => false),
    settings: computed(() => settings.value),
    setSettings: async (value) => {
      settings.value = { ...value }
    },
    refresh: async () => {
      error.value = null
      await handler?.()
    },
    onRefresh: (fn) => {
      handler = fn
    },
  }
}

/**
 * The context of the dashboard item being rendered: report `loading` and `error`, register a `refresh`, and read or
 * change the user's `settings` of the item.
 *
 * ```ts
 * const { loading, error, onRefresh } = useDashboardItem()
 * const { data, status, error: fetchError, refresh } = await useFetch('/api/shifts/me/next')
 * watchEffect(() => { loading.value = status.value === 'pending'; error.value = fetchError.value })
 * onRefresh(refresh)
 * ```
 */
export function useDashboardItem(): DashboardItemContext {
  return inject(dashboardItemKey, null) ?? standalone()
}
