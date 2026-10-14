// Framework-agnostic helpers: safe to import from a module's `setup()`, server code and tests.
export { addMcpDefinitions } from './build'
export type { McpDefinitionKind } from './build'
export { SCOPED_META_KEY, isPrincipalAllowed, pick, piiNotice, redactPii, scopeTags } from './access'
export type { RedactOptions, ScopedAccess } from './access'
export { MONEY_NOTICE, currencyDigits, fieldsFromCents, fromCents, toCents } from './money'
