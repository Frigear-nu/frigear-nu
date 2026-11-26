import type { CreateShortLinkInput } from '../../../../../../src/types'

// Makes links through the server utils, the way another module would (fixture only). `{ links }` makes many at once,
// `{ disable: owner }` disables and `{ delete: owner }` deletes an owner's links. Answers the links with their short URLs.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ links?: CreateShortLinkInput[], disable?: { module: string, refId?: string | null }, delete?: { module: string, refId?: string | null }, subject?: string }>(event)
  if (body.delete) return { deleted: await deleteShortLinks(body.delete) }
  if (body.disable) return { disabled: await disableShortLinks(body.disable) }
  const links = await createShortLinks(body.links ?? [])
  return links.map(link => ({ ...link, shortUrl: shortLinkUrl(link), subjectUrl: body.subject ? shortLinkUrl(link, body.subject) : null }))
})
