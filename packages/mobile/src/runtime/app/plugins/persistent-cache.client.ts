import { createStorage } from 'unstorage'
import type { MobilePublicConfig } from '../../../types'
import { capacitorFilesystemDriver } from '../../shared/filesystem-storage'
import { useCapacitor } from '../composables/useCapacitor'
import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { flushCachedFetch, hydrateCachedFetch, provideCachedFetchStorage } from '#mobile/optional'

/**
 * `mobile.persistentCache`: on a device, `useCachedFetch` keeps its responses in the app's Cache directory too, and
 * this reads the signed-in user's back before the first page sets up, so it renders with them at once and refreshes in
 * the background. After `@frigear-nu/ui`'s owner plugin (which runs after Auth restored the session), so the responses
 * read are the current user's. Waits `timeout` ms at most: a slow disk never holds the start.
 */
export default defineNuxtPlugin({
  name: 'mobile:persistent-cache',
  // A plugin of another module, not among this module's own plugin names when it is type-checked alone. A literal, so
  // Nuxt reads it at build time.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  dependsOn: ['ui:cached-fetch-owner'],
  async setup() {
    const config = (useRuntimeConfig().public.mobile as MobilePublicConfig | undefined)?.persistentCache
    const capacitor = useCapacitor()
    if (!config?.enabled || !capacitor.isNative || !provideCachedFetchStorage || !hydrateCachedFetch) return
    try {
      const filesystem = await capacitor.load('filesystem')
      if (!filesystem) return
      provideCachedFetchStorage(createStorage({ driver: capacitorFilesystemDriver({ filesystem }) }), { maxAge: config.maxAge })
      await hydrateCachedFetch({ timeout: config.timeout })
      // The app may be closed from the background: write what is pending when it goes there.
      const app = await capacitor.load('app')
      await app?.addListener('pause', () => {
        void flushCachedFetch?.()
      })
    }
    catch (error) {
      // Only a cache: the app works without it.
      console.warn('[@frigear-nu/mobile] The persistent cache is off:', error)
    }
  },
})
