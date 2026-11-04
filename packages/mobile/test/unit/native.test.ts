import { describe, expect, it } from 'vitest'
import { withoutThen } from '../../src/runtime/shared/native'

// Like `registerPlugin()` of @capacitor/core: a method for every property, `then` included, that calls the native side.
const capacitorPlugin = () => new Proxy({}, {
  get: (_, key) => (...args: unknown[]) => key === 'echo'
    ? Promise.resolve(args[0])
    // The native call of an unknown method rejects; it settles nothing it was handed (here: resolve and reject).
    : new Promise(() => {}),
}) as { echo: (value: string) => Promise<string> }

const settles = (promise: Promise<unknown>) => Promise.race([
  promise.then(() => 'settled', () => 'settled'),
  new Promise(resolve => setTimeout(resolve, 50, 'pending')),
])

describe('withoutThen', () => {
  it('lets a promise resolve to a Capacitor plugin', async () => {
    // The bug: the promise adopts the plugin as a thenable, calls its native `then()` and never settles.
    expect(await settles(Promise.resolve().then(capacitorPlugin))).toBe('pending')

    const plugin = await Promise.resolve().then(() => withoutThen(capacitorPlugin()))
    expect(await plugin.echo('hi')).toBe('hi')
  })
})
