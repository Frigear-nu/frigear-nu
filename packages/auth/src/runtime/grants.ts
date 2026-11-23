// `@frigear-nu/auth/grants`: grant lists (who may see a record), framework-free, so server code, the Vue app and tests
// can import the types, the zod shapes and `defineGrantKind`. Kinds are registered with `extendGrants` of
// `@frigear-nu/auth/utils`; server routes use the auto-imported `grantsCanRead`, `grantsMatch`, `grantsMembers` and
// `grantsValidate`.
export {
  GRANT_KIND_PATTERN,
  GRANT_PARAM_CHUNK,
  MAX_GRANTS,
  PUBLIC_GRANT_KIND,
  SIGNED_IN_GRANT_KIND,
  checkGrantList,
  chunkGrantParams,
  createGrantRegistry,
  defineGrantKind,
  grantListShape,
  hasPublicGrant,
  listGrantMembers,
  matchGrantList,
  parseGrant,
  publicGrantSchema,
  readGrants,
  signedInGrantSchema,
} from './utils/grants'
export type {
  Grant,
  GrantFieldMeta,
  GrantIssue,
  GrantKindDefinition,
  GrantKindRegistration,
  GrantMatchContext,
  GrantMembersContext,
  GrantRegistry,
  GrantUser,
  GrantValidateContext,
  PublicGrant,
  SignedInGrant,
} from './utils/grants'
