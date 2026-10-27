// Default button label and icon for common providers; any other nuxt-auth-utils provider shows its name with
// `DEFAULT_OAUTH_ICON`. `authentication.settings.oauth.<provider>.label`/`icon` override these, and
// `auth.oauth.<provider>.label` translates a default label.
export const OAUTH_PROVIDER_META: Record<string, { label: string, icon: string }> = {
  github: { label: 'GitHub', icon: 'i-simple-icons-github' },
  google: { label: 'Google', icon: 'i-simple-icons-google' },
  facebook: { label: 'Facebook', icon: 'i-simple-icons-facebook' },
  frigear: { label: 'frigear.nu', icon: 'i-lucide-log-in' },
  auth0: { label: 'Auth0', icon: 'i-simple-icons-auth0' },
  apple: { label: 'Apple', icon: 'i-simple-icons-apple' },
  discord: { label: 'Discord', icon: 'i-simple-icons-discord' },
  gitlab: { label: 'GitLab', icon: 'i-simple-icons-gitlab' },
  keycloak: { label: 'Keycloak', icon: 'i-simple-icons-keycloak' },
  okta: { label: 'Okta', icon: 'i-simple-icons-okta' },
  x: { label: 'X', icon: 'i-simple-icons-x' },
  oidc: { label: 'Single sign-on', icon: 'i-lucide-key-round' },
}

export const DEFAULT_OAUTH_ICON = 'i-lucide-log-in'
