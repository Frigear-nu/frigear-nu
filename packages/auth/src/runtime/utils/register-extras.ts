// The widget areas of auth's sign-in pages and what the registration form's widgets can send. Plain constants, so the
// pages, the register route and other modules share them.

/** The widget areas (`@frigear-nu/widget`) of the registration and login pages. */
export const AUTH_WIDGET_AREAS = {
  /** Below the fields of the registration form; its widgets can add `extras` to the request. */
  register: 'auth.register',
  /** Below the login form. */
  login: 'auth.login',
} as const

/** At most this many modules can add `extras` to one registration. */
export const AUTH_REGISTER_EXTRAS_MAX_KEYS = 20

/** The `extras` of a registration as JSON are at most this long. */
export const AUTH_REGISTER_EXTRAS_MAX_BYTES = 16_384

/**
 * The props a widget of `auth.register` gets: `setExtra(module, value)` puts `value` under `extras[module]` of the
 * registration request (`undefined` removes it), which `auth:user:created` listeners read.
 */
export type AuthRegisterWidgetProps = {
  setExtra: (module: string, value: unknown) => void
}
