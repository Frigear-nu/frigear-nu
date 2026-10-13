import { handleOAuthUser } from '../../utils/oauth'

export default defineOAuthGitHubEventHandler({
  config: { emailRequired: true },
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'github', user)
  },
})
