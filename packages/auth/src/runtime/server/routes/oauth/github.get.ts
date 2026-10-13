import { handleOAuthUser } from '../../utils/oauth'

const handler = defineOAuthGitHubEventHandler({
  config: { emailRequired: true },
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'github', user)
  },
})

export default eventHandler((event) => {
  rememberLoginRedirect(event)
  return handler(event)
})
