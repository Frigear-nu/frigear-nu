import { useModuleT, useOverlay } from '#imports'
import { useConfirmDialog } from '#mobile/optional'
import MobileConfirm from '../components/MobileConfirm.vue'
import { useCapacitor } from './useCapacitor'

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

export interface MobileConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** A red confirm button; on iOS an action sheet with a destructive action, as iOS asks. */
  destructive?: boolean
}

export interface ActionSheetOptions {
  title?: string
  message?: string
  actions: { title: string, destructive?: boolean }[]
  cancelLabel?: string
}

/**
 * Native feedback and prompts with web fallbacks, so callers need no platform checks:
 *
 * - `haptic(kind)`: a tap on a device, nothing in a browser.
 * - `actionSheet(options)`: the index of the chosen action, `null` when cancelled or in a browser (show a menu then).
 * - `confirm(options)`: a native alert / action sheet on a device, `useConfirmDialog` (`@frigear-nu/ui`) or the
 *   module's own modal in a browser.
 * - `share(data)`: the share sheet, else the Web Share API, else the link copied to the clipboard.
 */
export function useNative() {
  const capacitor = useCapacitor()
  const t = useModuleT('mobile')
  const overlay = useOverlay()
  const webConfirm = typeof useConfirmDialog === 'function' ? useConfirmDialog() : undefined

  async function actionSheet(options: ActionSheetOptions): Promise<number | null> {
    const plugin = await capacitor.load('actionSheet')
    if (!plugin) return null
    const { index, canceled } = await plugin.showActions({
      title: options.title,
      message: options.message,
      options: [
        ...options.actions.map(action => ({ title: action.title, style: action.destructive ? 'DESTRUCTIVE' as const : 'DEFAULT' as const })),
        { title: options.cancelLabel ?? t('cancel', 'Cancel'), style: 'CANCEL' as const },
      ],
    })
    return canceled || index < 0 || index >= options.actions.length ? null : index
  }

  return {
    ...capacitor,

    async haptic(kind: HapticKind = 'light'): Promise<void> {
      const haptics = await capacitor.load('haptics').catch(() => null)
      if (!haptics) return
      try {
        if (kind === 'selection') await haptics.selectionChanged()
        else if (kind === 'success' || kind === 'warning' || kind === 'error') await haptics.notification({ type: kind.toUpperCase() as 'SUCCESS' })
        else await haptics.impact({ style: kind.toUpperCase() as 'LIGHT' })
      }
      catch {
        // Feedback only: a failed haptic must never fail the action it accompanies.
      }
    },

    actionSheet,

    async confirm(options: MobileConfirmOptions): Promise<boolean> {
      const confirmLabel = options.confirmLabel ?? t('confirm', 'Confirm')
      const cancelLabel = options.cancelLabel ?? t('cancel', 'Cancel')
      if (capacitor.isNative) {
        if (options.destructive && capacitor.isIos && capacitor.has('actionSheet')) {
          return (await actionSheet({ title: options.title, message: options.description, actions: [{ title: confirmLabel, destructive: true }], cancelLabel })) === 0
        }
        const dialog = await capacitor.load('dialog')
        if (dialog) {
          const { value } = await dialog.confirm({ title: options.title, message: options.description ?? '', okButtonTitle: confirmLabel, cancelButtonTitle: cancelLabel })
          return value
        }
      }
      if (webConfirm) {
        return webConfirm({ title: options.title, description: options.description, confirmText: confirmLabel, cancelText: cancelLabel, destructive: options.destructive })
      }
      const modal = overlay.create(MobileConfirm, { destroyOnClose: true, props: { ...options, confirmLabel, cancelLabel } })
      return !!(await modal.open())
    },

    /** Resolves `true` when shared or copied, `false` when dismissed or not possible. */
    async share(data: { title?: string, text?: string, url?: string }): Promise<boolean> {
      const plugin = await capacitor.load('share')
      try {
        if (plugin) {
          await plugin.share({ ...data, dialogTitle: data.title })
          return true
        }
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          await navigator.share(data)
          return true
        }
        const text = data.url ?? data.text
        if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          return true
        }
      }
      catch {
        // Closing the share sheet rejects; that is not an error.
      }
      return false
    },
  }
}
