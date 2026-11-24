// `account:delete`: session only, so never granted in resource mode.
export default defineEventHandler(event => testCaller(event, 'account:delete'))
