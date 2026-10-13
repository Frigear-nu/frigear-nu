// Framework-agnostic helpers: safe to import from a module's `setup()`, server routes and tests.
export type {
  AuthPrincipal,
  AuthPrincipalKind,
  AuthResolverFn,
  AuthStoredUser,
  AuthTokenInfo,
  AuthUser,
  AuthUserCreate,
  AuthUserStore,
  AuthUserUpdate,
  RequireUserOptions,
} from '../types'
export type { AuthResolverDefinition, AuthScopeDefinition } from '../../types'
export { addAuthResolver, addAuthScope, setAuthUserStore } from './build'
export { ALL_SCOPES, hasScope, hasScopes, isGrantableScope, isPiiScope, parseScopeString } from './scopes'
export {
  USER_TOKEN_PREFIX,
  generateUserToken,
  describeToken,
  hashToken,
  looksLikeJwt,
  parseBearer,
  shouldTouchLastUsed,
  tokenStatus,
} from './tokens'
export type { TokenStatus } from './tokens'
