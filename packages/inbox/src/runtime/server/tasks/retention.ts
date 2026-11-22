// Deletes or anonymises the closed threads past their retention (see `inboxRunRetention`). Runs on
// `inbox.retention.cron`; `payload.now` (an ISO date) runs it as of another moment and `payload.mode` overrides the configured mode, for tests
// and catch-up runs.
export default defineTask({
  meta: {
    name: 'inbox:retention',
    description: 'Delete or anonymise closed inbox threads older than their mailbox keeps them.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    const mode = payload?.mode === 'delete' || payload?.mode === 'anonymise' ? payload.mode : undefined
    return { result: await inboxRunRetention({ now, mode }) }
  },
})
