import { handleOAuthUser } from '../../utils/oauth'

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'google', user)
  },
})
