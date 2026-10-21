// What a module does: dispatch its plain email, naming the template that may render it instead.
export default defineEventHandler(async (event) => {
  await dispatchEmailNotification({
    to: 'ada@example.com',
    subject: 'Fallback subject',
    body: '<p>Fallback body</p>',
    text: 'Fallback text',
    template: { name: getRouterParam(event, 'name')!, props: { name: 'Ada' } },
  })
  return { ok: true }
})
