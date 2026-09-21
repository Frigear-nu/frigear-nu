export interface OAuthServerModulePublicOptions {
  uiBase?: string
  apiBase?: string
}

export interface OAuthServerModuleOptions extends OAuthServerModulePublicOptions {
  jwtPrivateKey: string
  jwtPublicKey: string
}
