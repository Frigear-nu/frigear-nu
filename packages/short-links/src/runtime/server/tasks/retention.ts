// Deletes `short_link_clicks` rows older than `shortLinks.retention.days` (see `shortLinksRunRetention`); the counter
// on each link stays. Runs on `shortLinks.retention.cron`; `payload.now` (an ISO date) runs it as of another moment.
export default defineTask({
  meta: {
    name: 'short-links:retention',
    description: 'Delete short link click rows older than the retention period.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    return { result: await shortLinksRunRetention({ now }) }
  },
})
