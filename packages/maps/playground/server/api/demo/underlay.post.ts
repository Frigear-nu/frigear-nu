// The playground's underlay upload: a module's route stores the image with `storeMapUnderlay` (after authorizing the
// caller) and answers where to load it.
export default defineEventHandler(async (event) => {
  const stored = await storeMapUnderlay(event, { prefix: 'playground' })
  return { url: `/api/demo/underlay/${encodeURIComponent(stored.pathname)}`, width: stored.width, height: stored.height }
})
