// Deletes the per-recipient rows of campaigns finished more than `campaigns.retentionDays` ago; their counts stay on the
// campaign. `payload.now` (an ISO date) runs it as of another moment, for tests.
export default defineTask({
  meta: {
    name: 'campaigns:retention',
    description: 'Delete the delivery and click rows of old campaigns, keeping their counts.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    return { result: { pruned: await campaignsPruneDeliveries({ now }) } }
  },
})
