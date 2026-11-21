import type { OperationRow } from './utils/operations'

// The record rule of `operations:read` (registered with `addPolicies` in `module.ts`): an operation is readable when it
// is public, when the viewer takes part in it (`takesPart`: `viewer.operationIds` or an explicit team grant, filled through `audience:viewer:resolve` by the
// modules that know participation) or when the caller holds `operations:manage`. A policy only narrows: signed-in
// users hold `operations:read` implicitly, this decides which operations that covers.
export default [
  definePolicy<OperationRow>('operations:read', async ({ event, user, record }) => {
    if (!record) return undefined
    if (record.public) return true
    // Without a record, so this check does not run the record policies again.
    if (await allows(event, 'operations:manage')) return true
    const viewer = await resolveOperationsViewer(event, user)
    return operationReadable(record, viewer, false)
  }),
]
