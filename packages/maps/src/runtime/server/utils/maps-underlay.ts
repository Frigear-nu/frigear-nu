import type { H3Event } from 'h3'
import { blob } from '@nuxthub/blob'
import { apiError, badRequest, notFound, validationError } from '@frigear-nu/module-kit/server'
import { MAX_UNDERLAY_BYTES, UNDERLAY_EXTENSIONS, UNDERLAY_TYPES, imageSize, sniffImageType } from '../../utils/image'
import type { UnderlayType } from '../../utils/image'

/** Room for the multipart boundary and part headers around the image. */
const MULTIPART_ALLOWANCE = 16 * 1024

/** An underlay image stored in NuxtHub Blob. Keep `pathname` on the server; clients get a URL to the module's route. */
export type StoredMapUnderlay = {
  pathname: string
  contentType: UnderlayType
  width: number
  height: number
}

const maxBytesOf = (event: H3Event, override?: number) =>
  override ?? (Number(useRuntimeConfig(event).public.maps?.maxUnderlayBytes) || MAX_UNDERLAY_BYTES)

/**
 * Reads an underlay image from a multipart request (field `file`) and stores it in NuxtHub Blob under `prefix`. The
 * image must be a PNG, JPEG or WebP by its bytes (415 otherwise) and at most `maxBytes` (`maps.maxUnderlayBytes`,
 * 10 MB by default; 413 above). Its size is read from the bytes. Authorize the caller before calling it.
 */
export async function storeMapUnderlay(event: H3Event, options: { prefix: string, maxBytes?: number }): Promise<StoredMapUnderlay> {
  if (!(getRequestHeader(event, 'content-type') ?? '').includes('multipart/form-data')) throw badRequest('Send the image as multipart/form-data.')
  // The body is read into memory: refuse a request that does not say how large it is, or says it is too large, first.
  const maxBytes = maxBytesOf(event, options.maxBytes)
  const tooLarge = () => apiError(413, 'file_too_large', `The image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  const length = Number(getRequestHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length <= 0 || length > maxBytes + MULTIPART_ALLOWANCE) throw tooLarge()
  const parts = await readMultipartFormData(event) ?? []
  const file = parts.find(part => part.name === 'file' && part.filename)
  if (!file) throw validationError([{ path: ['file'], message: 'Choose an image.' }], 'Missing file')
  if (file.data.byteLength > maxBytes) throw tooLarge()
  const bytes = new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength)
  const type = sniffImageType(bytes)
  if (!type) throw apiError(415, 'unsupported_media_type', 'The image must be a PNG, JPEG or WebP.')
  const size = imageSize(bytes)
  if (!size || !size.width || !size.height) throw apiError(400, 'unreadable_image', 'The size of the image could not be read.')
  const saved = await blob.put(`underlay.${UNDERLAY_EXTENSIONS[type]}`, file.data, { contentType: type, prefix: options.prefix, addRandomSuffix: true })
  return { pathname: saved.pathname, contentType: type, width: size.width, height: size.height }
}

/**
 * Sends a stored underlay image: only an allowed image type, `nosniff`, inline. `cache` is `public` for an image
 * everyone may see, `private` otherwise; the URL should carry a version (`?v=`) so it may be cached. 404 when missing.
 */
export async function serveMapUnderlay(event: H3Event, underlay: Pick<StoredMapUnderlay, 'pathname' | 'contentType'> | null | undefined, options: { cache?: 'public' | 'private' } = {}) {
  if (!underlay?.pathname || !(UNDERLAY_TYPES as readonly string[]).includes(underlay.contentType)) throw notFound('There is no image.')
  const stored = await blob.get(underlay.pathname)
  if (!stored) throw notFound('There is no image.')
  setResponseHeader(event, 'content-type', underlay.contentType)
  setResponseHeader(event, 'content-disposition', 'inline')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'cache-control', `${options.cache ?? 'private'}, max-age=3600`)
  return stored
}

/** Deletes a stored underlay image; a failure is logged, never thrown (the record already moved on). */
export async function deleteMapUnderlay(underlay: Pick<StoredMapUnderlay, 'pathname'> | null | undefined): Promise<void> {
  if (!underlay?.pathname) return
  await blob.delete(underlay.pathname).catch((error: unknown) => console.error('[maps] an underlay image could not be deleted', error))
}
