import { handleOAuthUser } from '../../utils/oauth'

const handler = defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'google', user)
  },
})

export default eventHandler((event) => {
  rememberLoginRedirect(event)
  return handler(event)
})
