// The record rule of `help-center:read` (registered with `addPolicies` in `module.ts`): the record is a category, an
// article or a checklist, and its own grants (`@frigear-nu/auth`) must admit the user. Chains (a subcategory under its
// parent, an article in its category) are walked by the caller, one record at a time; an article that inherits its
// category (`grants: null`) is never checked on its own. A policy only narrows: signed-in users hold `help-center:read`
// implicitly, this decides which records that covers. Anonymous callers only ever read through a `public` grant, which
// `grantsCanRead` serves without asking this policy.
export default [
  definePolicy<{ grants: unknown }>('help-center:read', ({ event, user, record }) => {
    if (!record) return undefined
    return grantsMatch(event, user, record.grants)
  }),
]
