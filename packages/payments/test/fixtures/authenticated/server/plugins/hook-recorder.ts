// Test-only: records every payments lifecycle hook so tests can assert emission (and its absence).
const calls: Array<{ hook: string, paymentId: string, status: string, refundedAmount: number }> = []

export const getHookCalls = () => calls
export const resetHookCalls = () => {
  calls.length = 0
}

export default defineNitroPlugin((nitro) => {
  for (const hook of ['payments:paid', 'payments:failed', 'payments:expired', 'payments:refunded'] as const) {
    nitro.hooks.hook(hook, ({ payment }) => {
      calls.push({ hook, paymentId: payment.id, status: payment.status, refundedAmount: payment.refundedAmount })
    })
  }
})
