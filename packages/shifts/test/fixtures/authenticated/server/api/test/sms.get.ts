// Test-only: the SMS notify was asked to send, optionally only the ones to `?to=`.
export default defineEventHandler((event) => {
  const { to } = getQuery(event) as { to?: string }
  return to ? testSms.filter(sms => sms.to.includes(to)) : testSms
})
