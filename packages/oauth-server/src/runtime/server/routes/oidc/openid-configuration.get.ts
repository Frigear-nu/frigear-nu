import { oidc } from '../../../utils/api'

export default defineEventHandler((event) => {
  const issuer = getOAuthIssuer(event)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return {
    issuer,
    authorization_endpoint: `${issuer}${oidc.authorize}`,
    token_endpoint: `${issuer}${oidc.token}`,
    userinfo_endpoint: `${issuer}${oidc.userinfo}`,
    revocation_endpoint: `${issuer}${oidc.revoke}`,
    jwks_uri: `${issuer}${oidc.jwks}`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: getSupportedScopes(),
    // `none`: public clients (native apps, SPAs) identify with `client_id` and PKCE only.
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'name', 'picture', 'email', 'email_verified'],
  }
})
