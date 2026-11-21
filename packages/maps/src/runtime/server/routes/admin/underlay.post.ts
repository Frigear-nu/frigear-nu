import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import { eq } from 'drizzle-orm'
import { apiError, badRequest, idParams, validationError } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import { MAX_UNDERLAY_BYTES, UNDERLAY_EXTENSIONS, imageSize, sniffImageType } from '../../../utils/image'
import { planeBoundsFor } from '../../../utils/view'
import type { AdminMapDto } from '../../../../types'

// Uploads the floor plan of a plane map (multipart: `file`, `width`, `height`). PNG, JPEG or WebP by their bytes (415
// otherwise), at most `maps.settings.maxUnderlayBytes` (10 MB by default, 413 above). The client measures the image;
// the server checks the measure against the image itself. The image is placed at `[[0, 0], [height, width]]` and the
// map's view becomes those bounds. A replaced image is deleted.
export default defineEventHandler(async (event): Promise<AdminMapDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  if (!(getRequestHeader(event, 'content-type') ?? '').includes('multipart/form-data')) throw badRequest('Send the floor plan as multipart/form-data.')
  const parts = await readMultipartFormData(event) ?? []
  const row = await getMapOr404(id)
  if (row.base !== 'plane') throw badRequest('Only plane maps have a floor plan.')

  const file = parts.find(part => part.name === 'file' && part.filename)
  if (!file) throw validationError([{ path: ['file'], message: 'Choose an image.' }], 'Missing file')
  const fields = mapsUnderlayFields.safeParse(Object.fromEntries(parts.filter(part => !part.filename && part.name).map(part => [part.name!, part.data.toString('utf8')])))
  if (!fields.success) throw validationError(fields.error.issues, 'Invalid size')

  const maxBytes = Number(useRuntimeConfig(event).public.maps?.maxUnderlayBytes) || MAX_UNDERLAY_BYTES
  if (file.data.byteLength > maxBytes) throw apiError(413, 'file_too_large', `The image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  const bytes = new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength)
  const type = sniffImageType(bytes)
  if (!type) throw apiError(415, 'unsupported_media_type', 'The floor plan must be a PNG, JPEG or WebP image.')
  const { width, height } = fields.data
  const size = imageSize(bytes)
  if (size && (size.width !== width || size.height !== height)) {
    throw validationError([{ path: ['width'], message: `The image is ${size.width} by ${size.height} pixels.` }], 'Invalid size')
  }

  const saved = await blob.put(`underlay.${UNDERLAY_EXTENSIONS[type]}`, file.data, { contentType: type, prefix: `maps/${row.id}`, addRandomSuffix: true })
  const bounds = planeBoundsFor(width, height)
  const [updated] = await db.update(schema.maps).set({
    underlay: { pathname: saved.pathname, contentType: type, width, height, bounds },
    view: { bounds },
  }).where(eq(schema.maps.id, row.id)).returning()

  if (row.underlay?.pathname && row.underlay.pathname !== saved.pathname) {
    await blob.delete(row.underlay.pathname).catch((error: unknown) => console.error('[maps] the old floor plan could not be deleted', error))
  }
  return toAdminMapDto(updated!, await mapsOwnerLabel(event, updated!))
})
