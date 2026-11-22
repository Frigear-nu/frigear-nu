import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PushNotification } from '../src/types'
import { logDriver } from '../src/runtime/drivers/log'

// The driver `#notify/push-driver` resolves to is chosen at build time (`notify.push.driver`); here it is a stub.
const registered = vi.hoisted(() => vi.fn())
vi.mock('#notify/push-driver', () => ({ default: registered }))
vi.mock('#notify/sms-driver', () => ({ default: vi.fn() }))
vi.mock('#notify/simple-driver', () => ({ default: vi.fn() }))

const push: PushNotification = { userIds: [1, 2], title: { da: 'Hej', en: 'Hi' }, body: 'Body', url: '/shifts/1', data: { kind: 'test' } }

afterEach(() => {
  vi.restoreAllMocks()
  registered.mockReset()
})

describe('push log driver', () => {
  it('logs the notification instead of sending it', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(logDriver(push)).toBeUndefined()
    expect(log).toHaveBeenCalledWith('[notify] Dispatching notification:', push)
  })
})

describe('dispatchPushNotification', () => {
  it('hands the notification to the registered driver and answers its result', async () => {
    const { dispatchPushNotification } = await import('../src/runtime/server/utils/dispatch')
    registered.mockResolvedValue({ sent: 2, failed: 0, revoked: 1 })
    await expect(dispatchPushNotification(push)).resolves.toEqual({ sent: 2, failed: 0, revoked: 1 })
    expect(registered).toHaveBeenCalledWith(push)
  })

  it('answers undefined when the driver reports nothing', async () => {
    const { dispatchPushNotification } = await import('../src/runtime/server/utils/dispatch')
    registered.mockResolvedValue(undefined)
    await expect(dispatchPushNotification(push)).resolves.toBeUndefined()
  })

  it('does not call the driver without users', async () => {
    const { dispatchPushNotification } = await import('../src/runtime/server/utils/dispatch')
    await expect(dispatchPushNotification({ ...push, userIds: [] })).resolves.toEqual({ sent: 0, failed: 0 })
    expect(registered).not.toHaveBeenCalled()
  })

  it('lets a driver error reach the caller', async () => {
    const { dispatchPushNotification } = await import('../src/runtime/server/utils/dispatch')
    registered.mockRejectedValue(new Error('provider down'))
    await expect(dispatchPushNotification(push)).rejects.toThrow('provider down')
  })
})
