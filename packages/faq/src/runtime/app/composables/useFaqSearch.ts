import type { MaybeRefOrGetter } from 'vue'
import { refDebounced } from '@vueuse/core'
import { faqApi } from '../../utils/api'
import type { FaqSearchResult } from '../../../types'
import { $fetch, ref, toValue, watch } from '#imports'

export type UseFaqSearchOptions = {
  /** Wait this long (ms) after the last keystroke. Defaults to `250`. */
  delay?: number
  /** Search only from this many characters. Defaults to `2`. */
  minLength?: number
  /** Only the groups owned by this operation. */
  operationId?: MaybeRefOrGetter<string | null | undefined>
  /** Search what anonymous visitors read only (`?public=1`). */
  public?: boolean
}

/**
 * A searchable FAQ page: bind `q` to an input and show `results`. The query is debounced, a slower earlier answer never
 * replaces a newer one, and a query shorter than `minLength` clears the results. Runs on the client.
 *
 *     const { q, results, status } = useFaqSearch()
 */
export function useFaqSearch(options: UseFaqSearchOptions = {}) {
  const q = ref('')
  const results = ref<FaqSearchResult[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<unknown>(null)
  const debounced = refDebounced(q, options.delay ?? 250)
  const minLength = options.minLength ?? 2
  let latest = 0

  watch(debounced, async (value) => {
    const term = value.trim()
    const run = ++latest
    if (term.length < minLength) {
      results.value = []
      error.value = null
      status.value = 'idle'
      return
    }
    status.value = 'pending'
    try {
      const found = await $fetch<FaqSearchResult[]>(faqApi.search, {
        query: { q: term, operation: toValue(options.operationId) || undefined, public: options.public ? 1 : undefined },
      })
      if (run !== latest) return
      results.value = found
      error.value = null
      status.value = 'success'
    }
    catch (caught) {
      if (run !== latest) return
      error.value = caught
      status.value = 'error'
    }
  })

  return { q, results, status, error }
}
