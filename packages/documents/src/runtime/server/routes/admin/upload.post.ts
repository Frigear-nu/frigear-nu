import { blob } from '@nuxthub/blob'
import { db, schema } from '@nuxthub/db'
import { DEFAULT_ACCEPT, isAccepted, newId, safeFilename } from '../../../utils'
import { uploadMeta } from '../../utils/admin-schemas'

// Multipart: one `file` part and an optional `meta` part holding JSON (title, description, icon, parentId, audience, groupIds).
export default defineEventHandler(async (event) => {
  await requireDocumentsManager(event)
  const config = useRuntimeConfig(event).documents as { maxFileSize: number, accept: string[] } | undefined
  const maxFileSize = config?.maxFileSize ?? 25 * 1024 * 1024
  const accept = config?.accept ?? DEFAULT_ACCEPT

  const parts = await readMultipartFormData(event) ?? []
  const file = parts.find(part => part.name === 'file' && part.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Attach a file.' })

  const metaPart = parts.find(part => part.name === 'meta')
  let metaJson: unknown = {}
  try {
    if (metaPart) metaJson = JSON.parse(metaPart.data.toString('utf8'))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'The metadata is not valid JSON.' })
  }
  const meta = uploadMeta.safeParse(metaJson)
  if (!meta.success) throw createError({ statusCode: 400, statusMessage: meta.error.issues[0]?.message ?? 'Invalid metadata.' })

  const contentType = file.type || 'application/octet-stream'
  if (!isAccepted(contentType, accept)) throw createError({ statusCode: 415, statusMessage: `Files of type ${contentType} are not accepted.` })
  if (file.data.byteLength > maxFileSize) throw createError({ statusCode: 413, statusMessage: 'The file is too large.' })

  const parentId = await assertFolder(meta.data.parentId)
  const id = newId('doc')
  const filename = safeFilename(file.filename!)
  const saved = await blob.put(filename, file.data, { contentType, prefix: `documents/${id}`, addRandomSuffix: true })

  try {
    await db.insert(schema.documents).values({
      id,
      parentId,
      kind: 'file',
      title: meta.data.title ?? filename.replace(/\.[^.]+$/, ''),
      description: meta.data.description ?? null,
      icon: meta.data.icon ?? null,
      sortOrder: meta.data.sortOrder ?? 0,
      audience: meta.data.audience ?? 'groups',
      pathname: saved.pathname,
      filename,
      contentType,
      size: file.data.byteLength,
    })
    await setShares(id, meta.data.groupIds ?? [])
  }
  catch (cause) {
    await blob.del(saved.pathname).catch(() => undefined)
    throw cause
  }

  setResponseStatus(event, 201)
  const { rows, shares } = await loadDocuments()
  return toAdminDto(rows.find(candidate => candidate.id === id)!, shares)
})
