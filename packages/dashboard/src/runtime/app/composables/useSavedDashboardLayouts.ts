import { computed, type ComputedRef } from 'vue'
import type { DashboardLayout, DashboardLayoutsDto } from '../../../types'
import { dashboardApi } from '../../utils/api'
import { $fetch, useRequestFetch, useState } from '#imports'

type Layouts = Record<string, DashboardLayout>

interface SavedLayouts {
  /** Whose layouts these are (`user:<id>`); `null` before the first load. */
  owner: string | null
  layouts: Layouts
}

export interface SavedDashboardLayouts {
  /** The saved layouts of `owner`, by dashboard name (empty while they load or for another owner). */
  layouts: (owner: string) => Layouts
  /** Loads the saved layouts of `owner` once (on the server too, with the request's cookie). A failure leaves none. */
  load: (owner: string) => Promise<void>
  /** Saves the named layouts (`null` removes one) and keeps the answer as the saved layouts. Throws on failure. */
  save: (owner: string, change: Record<string, DashboardLayout | null>) => Promise<void>
  /** The last loaded owner. */
  owner: ComputedRef<string | null>
}

/**
 * The signed-in user's saved dashboard layouts, from `GET`/`PATCH /api/dashboard/me/layouts` (the `managed`
 * `dashboardLayouts` preference, which is never in the session cookie). Used by `useDashboardLayout`; only available
 * with `@frigear-nu/preferences` and Auth in server mode.
 */
export function useSavedDashboardLayouts(): SavedDashboardLayouts {
  const state = useState<SavedLayouts>('dashboard:saved', () => ({ owner: null, layouts: {} }))
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch
  const loading = new Map<string, Promise<void>>()

  async function load(owner: string) {
    if (state.value.owner === owner) return
    const running = loading.get(owner)
    if (running) return running
    const promise = (async () => {
      try {
        const answer = await requestFetch<DashboardLayoutsDto>(dashboardApi.me.layouts)
        state.value = { owner, layouts: answer?.layouts ?? {} }
      }
      catch {
        state.value = { owner, layouts: {} }
      }
      finally {
        loading.delete(owner)
      }
    })()
    loading.set(owner, promise)
    return promise
  }

  async function save(owner: string, change: Record<string, DashboardLayout | null>) {
    const answer = await $fetch<DashboardLayoutsDto>(dashboardApi.me.layouts, { method: 'PATCH', body: { layouts: change } })
    state.value = { owner, layouts: answer?.layouts ?? {} }
  }

  return {
    layouts: owner => state.value.owner === owner ? state.value.layouts : {},
    load,
    save,
    owner: computed(() => state.value.owner),
  }
}
