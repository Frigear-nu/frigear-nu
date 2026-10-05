import type {
  SimpleDriver,
  UIDriver,
  SMSDriver,
  EmailDriver,
  SimpleNotification,
  UINotification,
  SMSNotification,
  EmailNotification,
} from '../../../types'

/*
 * Simple helpers to define notifications in a typed way.
 */
// ----------------------------------------------------------------
export const defineSimpleNotification = <T extends SimpleNotification>(notification: T) => notification
export const defineUINotification = <T extends UINotification>(notification: T) => notification

export const defineEmailNotification = <T extends EmailNotification>(notification: T) => notification
export const defineSMSNotification = <T extends SMSNotification>(notification: T) => notification

// Driver definers
export const defineSimpleDriver = (driver: SimpleDriver) => driver
export const defineUIDriver = (driver: UIDriver) => driver
export const defineSMSDriver = (driver: SMSDriver) => driver
export const defineEmailDriver = (driver: EmailDriver) => driver
