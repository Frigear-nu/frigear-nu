// Deletes `short_link_clicks` rows older than `shortLinks.retention.days` and links with `autoDelete` that expired or
// were disabled more than `retention.deleteAfterDays` ago (see `shortLinksRunRetention`). Runs on
// `shortLinks.retention.cron`; `payload.now` (an ISO date) runs it as of another moment.
export default defineTask({
  meta: {
    name: 'short-links:retention',
    description: 'Delete old short link click rows and expired short links marked for deletion.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    return { result: await shortLinksRunRetention({ now }) }
  },
})
