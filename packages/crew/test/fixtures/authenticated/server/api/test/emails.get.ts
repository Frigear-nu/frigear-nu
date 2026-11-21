// Test-only: the emails notify was asked to deliver, optionally only the ones to `?to=`.
export default defineEventHandler((event) => {
  const { to } = getQuery(event) as { to?: string }
  return to ? testEmails.filter(email => [email.to].flat().includes(to)) : testEmails
})
