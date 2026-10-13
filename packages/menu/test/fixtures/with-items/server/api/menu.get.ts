export default defineEventHandler((event) => {
  const { path } = getQuery(event)
  return useMenu(event, String(path))
})
