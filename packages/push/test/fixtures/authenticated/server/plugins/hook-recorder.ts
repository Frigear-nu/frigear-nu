// Test-only: records every `push:device:registered` call so tests can assert emission.
const calls: Array<{ hook: string, deviceId: string, userId: number, platform: string, token?: string }> = []

export const getHookCalls = () => calls
export const resetHookCalls = () => {
  calls.length = 0
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('push:device:registered', ({ device }) => {
    calls.push({ hook: 'push:device:registered', deviceId: device.id, userId: device.userId, platform: device.platform })
  })
})
