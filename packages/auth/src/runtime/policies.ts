// `@frigear-nu/auth/policies`: framework-free, so a `shared/policies.ts` file can import it from the app, the server
// and a resource server alike. No Nuxt, Vue, h3 or database imports belong here.
export { defineSharedPolicy, runSharedPolicies } from './utils/permissions'
export type {
  AccessDto,
  DefinePolicy,
  PolicyContext,
  PolicyDefinition,
  PolicyFn,
  PolicyOptions,
  PolicyResult,
  SharedPolicyContext,
  SharedPolicyDefinition,
  SharedPolicyFn,
} from './utils/permissions'
