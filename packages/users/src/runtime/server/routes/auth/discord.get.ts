import { handleOAuthUser } from '../../utils/oauth'

export default defineOAuthDiscordEventHandler({
  async onSuccess(event, { user }) {
    return handleOAuthUser(event, 'discord', user)
  },
})
