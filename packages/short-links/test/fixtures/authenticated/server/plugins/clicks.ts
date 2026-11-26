import { clickLog } from '../utils/test-state'

// Records what the `short-links:clicked` hook receives, for `GET /api/test/clicks`.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('short-links:clicked', ({ link, subject }) => {
    clickLog.push({ code: link.code, owner: link.owner.module, refId: link.owner.refId ?? null, subject })
  })
})
