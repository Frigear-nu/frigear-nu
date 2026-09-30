import { handleOAuthUser } from '../../utils/oauth'

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'github', user)
  },
})
