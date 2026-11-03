import { appName } from '../identity'

export default defineAppConfig({
  // The /login page of @frigear-nu/oauth-client. `logo` takes an image path, or `{ light, dark }`.
  oauthClient: {
    login: {
      title: appName,
      description: 'Sign in with your account to continue.',
      icon: 'i-lucide-smartphone',
    },
  },
})
