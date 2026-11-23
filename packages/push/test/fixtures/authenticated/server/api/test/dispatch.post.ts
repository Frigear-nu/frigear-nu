import type { PushNotification } from '../../../../../../../notify/src/types'

// Test-only: what a feature module does to send push, through notify's dispatcher (push is notify's push driver).
export default defineEventHandler(async (event) => {
  return (await dispatchPushNotification(await readBody<PushNotification>(event))) ?? null
})
