// Stands in for the server module a Nuxt build generates (`#help-center/optional`); the tests mock it.
export const dispatchEmailNotification = () => {
  throw new Error('stub')
}
export const dispatchSMSNotification = dispatchEmailNotification
export const notifyAvailable = false
export const notifyUser = undefined
export const pushAvailable = false
