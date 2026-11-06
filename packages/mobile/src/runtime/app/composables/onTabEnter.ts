import { onActivated } from '#imports'

/**
 * Runs `callback` each time the user comes back to this page after it was kept alive (a tab switch, a back
 * navigation), not on the first visit. The place to refresh a tab's data in the background:
 *
 * ```ts
 * const { data, refresh } = await useApi('/api/me')
 * onTabEnter(() => refresh())
 * ```
 */
export function onTabEnter(callback: () => unknown): void {
  let first = true
  onActivated(() => {
    if (first) {
      first = false
      return
    }
    void callback()
  })
}
