// Sends due campaigns (see `campaignsDeliverPass`). Runs on `campaigns.deliverCron` (every minute); `payload.now` (an
// ISO date) runs it as of another moment and `payload.batchSize` overrides the configured batch, for tests.
export default defineTask({
  meta: {
    name: 'campaigns:deliver',
    description: 'Start due campaigns and send a batch of their messages.',
  },
  async run({ payload }) {
    const now = typeof payload?.now === 'string' && !Number.isNaN(Date.parse(payload.now)) ? new Date(payload.now) : undefined
    const batchSize = typeof payload?.batchSize === 'number' && Number.isSafeInteger(payload.batchSize) && payload.batchSize > 0 ? payload.batchSize : undefined
    return { result: await campaignsDeliverPass({ now, batchSize }) }
  },
})
