import type { ActionOptions } from '../types'
import { useErrorToast } from './useErrorToast'
import { ref, useToast } from '#imports'

/**
 * Runs an async action with a `busy` flag and toasts: `success` once it worked, the error (titled `error`) when it
 * failed. Errors are swallowed: `run` then resolves with `undefined`.
 *
 * ```ts
 * const { busy, run } = useAction()
 * const saved = await run(() => $fetch('/api/events', { method: 'POST', body }), { success: 'Event created' })
 * ```
 */
export function useAction() {
  const busy = ref(false)
  const toast = useToast()
  const showError = useErrorToast()

  async function run<T>(fn: () => Promise<T>, options: ActionOptions = {}): Promise<T | undefined> {
    busy.value = true
    try {
      const result = await fn()
      if (options.success) toast.add({ title: options.success, color: 'success', icon: 'i-lucide-check' })
      return result
    }
    catch (e) {
      showError(e, options.error)
      return undefined
    }
    finally {
      busy.value = false
    }
  }

  return { busy, run }
}
