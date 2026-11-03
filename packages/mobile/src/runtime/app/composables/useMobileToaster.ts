import { useRuntimeConfig } from '#imports'

/**
 * Props for `<UApp :toaster="useMobileToaster()">`: toasts drop in from the top, below the navbar, as iOS banners do
 * (at the bottom the tab bar would cover them). `undefined` with `mobile.appearance.toasterOffset: false`.
 */
export function useMobileToaster() {
  if (!useRuntimeConfig().public.mobile.toasterOffset) return undefined
  return { position: 'top-center' as const, ui: { viewport: 'top-[calc(var(--mobile-inset-top)+0.5rem)]' } }
}
