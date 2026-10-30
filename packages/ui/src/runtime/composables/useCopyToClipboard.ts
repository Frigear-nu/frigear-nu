import { useClipboard } from '@vueuse/core'
import { useErrorToast } from './useErrorToast'
import { useUiT } from './useTranslatedLocales'
import { useToast } from '#imports'

/** Copies text to the clipboard and confirms it with a toast ("Copied", or `message`). Resolves `false` on failure. */
export function useCopyToClipboard() {
  const { copy: write } = useClipboard({ legacy: true })
  const toast = useToast()
  const showError = useErrorToast()
  const t = useUiT('patterns')

  async function copy(text: string, message?: string): Promise<boolean> {
    try {
      await write(text)
      toast.add({ title: message ?? t('copied', 'Copied'), color: 'success', icon: 'i-lucide-clipboard-check' })
      return true
    }
    catch (e) {
      showError(e)
      return false
    }
  }

  return { copy }
}
