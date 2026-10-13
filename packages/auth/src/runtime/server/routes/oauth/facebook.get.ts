import { handleOAuthUser } from '../../utils/oauth'

// Facebook only returns the fields asked for; credentials come from NUXT_OAUTH_FACEBOOK_CLIENT_ID/_SECRET.
export default defineOAuthFacebookEventHandler({
  config: { scope: ['email'], fields: ['id', 'name', 'email', 'picture'] },
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'facebook', user)
  },
})
