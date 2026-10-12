import { LazyConfirmDialog } from '#components'

export interface ConfirmDialogOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** Style the confirm button as destructive. */
  destructive?: boolean
}

export const useConfirmDialog = () => {
  const overlay = useOverlay()

  return (options: ConfirmDialogOptions): Promise<boolean> => {
    const modal = overlay.create(LazyConfirmDialog, {
      destroyOnClose: true,
      props: options,
    })

    return modal.open()
  }
}
