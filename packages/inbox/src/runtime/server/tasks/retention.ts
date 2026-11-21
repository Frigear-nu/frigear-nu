// Deletes or anonymises the closed threads past their retention (see `inboxRunRetention`). Runs on
// `inbox.retention.cron`; `payload.now` (an ISO date) runs it as of another moment, for tests and catch-up runs.
export default defineTask({
  meta: {
    name: 'inbox:retention',
    description: 'Delete or anonymise closed inbox threads older than their mailbox keeps them.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    return { result: await inboxRunRetention({ now }) }
  },
})
