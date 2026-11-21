import type { MaybeRefOrGetter } from 'vue'
import { refDebounced } from '@vueuse/core'
import { helpCenterApi } from '../../utils/api'
import type { HelpArticleSummaryDto } from '../../../types'
import { $fetch, ref, toValue, watch } from '#imports'

export type UseHelpCenterSearchOptions = {
  /** Wait this long (ms) after the last keystroke. Defaults to `250`. */
  delay?: number
  /** Search only from this many characters. Defaults to `2`. */
  minLength?: number
  /** Only the articles of the category with this URL name. */
  category?: MaybeRefOrGetter<string | null | undefined>
  /** Search what anonymous visitors read only (`?public=1`). */
  public?: boolean
}

/**
 * A searchable help center: bind `q` to an input and show `results`. The query is debounced, a slower earlier answer
 * never replaces a newer one, and a query shorter than `minLength` clears the results. Runs on the client.
 *
 *     const { q, results, status } = useHelpCenterSearch()
 */
export function useHelpCenterSearch(options: UseHelpCenterSearchOptions = {}) {
  const q = ref('')
  const results = ref<HelpArticleSummaryDto[]>([])
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
      const found = await $fetch<HelpArticleSummaryDto[]>(helpCenterApi.articles, {
        query: { q: term, category: toValue(options.category) || undefined, public: options.public ? 1 : undefined },
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
