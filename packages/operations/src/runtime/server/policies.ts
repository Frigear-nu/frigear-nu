import type { OperationRow } from './utils/operations'

// The record rule of `operations:read` (registered with `addPolicies` in `module.ts`): an operation is readable when it
// is public, when the user takes part in it (`operations:participation:resolve`, answered by the modules that know
// participation, such as crew) or when the caller holds `operations:manage`. A policy only narrows: signed-in users
// hold `operations:read` implicitly, this decides which operations that covers.
export default [
  definePolicy<OperationRow>('operations:read', async ({ event, user, record }) => {
    if (!record) return undefined
    if (record.public) return true
    // Without a record, so this check does not run the record policies again.
    if (await allows(event, 'operations:manage')) return true
    return operationReadable(event, record, user, false)
  }),
]
