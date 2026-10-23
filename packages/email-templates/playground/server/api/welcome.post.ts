export default defineEventHandler(async () => {
  await sendEmailTemplate('welcome', { name: 'Ada', url: 'https://example.com' }, { to: 'ada@example.com' })
  return { ok: true }
})
