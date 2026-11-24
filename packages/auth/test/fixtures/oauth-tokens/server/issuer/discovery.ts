import { defineEventHandler, getRequestURL } from 'h3'
import { fakeIssuerUrl } from '../utils/fake-issuer'

// `<issuer>/.well-known/openid-configuration` of the fake frigear.nu (a dot folder, so registered in nuxt.config).
export default defineEventHandler((event) => {
  const issuer = fakeIssuerUrl(getRequestURL(event).origin)
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  }
})
