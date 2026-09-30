import { enrichSessionUser } from '../utils/session'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session) => {
    if (!session.user?.id) return

    const enriched = await enrichSessionUser(session.user.id)
    if (enriched) session.user = enriched
  })
})
