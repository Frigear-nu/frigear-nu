// The record rule of `faq:read` (registered with `addPolicies` in `module.ts`): the record is a group or an item, and
// its grants (`@frigear-nu/grants`) must admit the user. An item that inherits its group (`grants: null`) is never
// checked on its own: `faqCanReadItem` checks the group. A policy only narrows: signed-in users hold `faq:read`
// implicitly, this decides which records that covers. Anonymous callers only ever read through a `public` grant, which
// `grantsCanRead` serves without asking this policy.
export default [
  definePolicy<{ grants: unknown }>('faq:read', ({ event, user, record }) => {
    if (!record) return undefined
    return grantsMatch(event, user, record.grants)
  }),
]
