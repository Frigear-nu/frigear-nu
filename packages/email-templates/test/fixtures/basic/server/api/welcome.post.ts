export default defineEventHandler(async () => {
  await sendEmailTemplate('welcome', { name: 'Ada' }, { to: 'ada@example.com', replyTo: 'support@example.com' })
  return { ok: true }
})
