import { errorToToast } from '../utils/errors'
import { useUiT } from './useTranslatedLocales'

/**
 * Shows an error as a red toast: `title` (default "Something went wrong.") with the error's message as description.
 *
 * ```ts
 * const showError = useErrorToast()
 * try { await save() } catch (e) { showError(e, 'Could not save the event') }
 * ```
 */
export function useErrorToast() {
  const toast = useToast()
  const t = useUiT('patterns')
  return (e: unknown, title?: string): void => {
    toast.add(errorToToast(e, { title: title ?? t('genericError', 'Something went wrong.') }))
  }
}
