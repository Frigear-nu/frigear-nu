import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { MAX_UNDERLAY_DIMENSION } from '../../src/runtime/utils/image'
import { pngBytes } from '../images'

const put = vi.hoisted(() => vi.fn(async (name: string) => ({ pathname: `venue/${name}` })))
vi.mock('@nuxthub/blob', () => ({ blob: { put } }))

// The h3 and Nitro helpers the server util reaches through auto-imports.
function upload(bytes: Uint8Array) {
  const data = Buffer.from(bytes)
  vi.stubGlobal('getRequestHeader', (_event: H3Event, name: string) =>
    name === 'content-type' ? 'multipart/form-data; boundary=x' : name === 'content-length' ? String(data.byteLength + 200) : undefined)
  vi.stubGlobal('readMultipartFormData', async () => [{ name: 'file', filename: 'plan.png', data }])
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { maps: {} } }))
}

describe('storeMapUnderlay', () => {
  beforeEach(() => put.mockClear())
  afterEach(() => vi.unstubAllGlobals())

  it('stores an image and returns its size', async () => {
    const { storeMapUnderlay } = await import('../../src/runtime/server/utils/maps-underlay')
    upload(pngBytes(40, 30))
    await expect(storeMapUnderlay({} as H3Event, { prefix: 'venue' })).resolves.toMatchObject({ contentType: 'image/png', width: 40, height: 30 })
    expect(put).toHaveBeenCalledOnce()
  })

  it('refuses an image larger than a layout can store, before storing it', async () => {
    const { storeMapUnderlay } = await import('../../src/runtime/server/utils/maps-underlay')
    upload(pngBytes(MAX_UNDERLAY_DIMENSION + 1, 1))
    await expect(storeMapUnderlay({} as H3Event, { prefix: 'venue' })).rejects.toMatchObject({ statusCode: 400, data: { code: 'image_too_large' } })
    upload(pngBytes(1, MAX_UNDERLAY_DIMENSION + 1))
    await expect(storeMapUnderlay({} as H3Event, { prefix: 'venue' })).rejects.toMatchObject({ statusCode: 400, data: { code: 'image_too_large' } })
    expect(put).not.toHaveBeenCalled()
  })
})
