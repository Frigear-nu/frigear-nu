import type { PushRuntimeConfig } from '../../../types'
import { pushConfigProblems } from '../../providers/config'

// Checks the push settings once when the server starts, so a malformed `NUXT_PUSH_FCM_SERVICE_ACCOUNT`,
// `NUXT_PUSH_IOS` or `NUXT_PUSH_DELIVERY` shows in the log at boot rather than as failed pushes later. It does not stop
// the server: `sendPush` counts the devices as failed and device registration keeps working until the setting is fixed.
export default defineNitroPlugin(() => {
  const problems = pushConfigProblems(useRuntimeConfig().push as PushRuntimeConfig)
  for (const problem of problems) {
    console.error(`[@frigear-nu/push] Invalid push setting, pushes will fail until it is fixed: ${problem}`)
  }
})
