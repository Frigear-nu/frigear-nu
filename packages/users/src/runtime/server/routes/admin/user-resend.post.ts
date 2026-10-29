import { notConfigured } from '@frigear-nu/module-kit/server'

export default defineEventHandler(async (event) => {
  const { target } = await loadUsersAdminTarget(event, 'update')
  const sent = await sendVerificationLink(event, target)
  if (!sent) {
    throw notConfigured('Sign-in links are not enabled.')
  }
  return { ok: true }
})
