// The phone number rule of `@frigear-nu/users`, framework free so the server schemas, the admin form and other modules
// that store `users.phone` (through `parseUserPhone`) share it.

/** The longest phone number stored on a user. */
export const USER_PHONE_MAX_LENGTH = 40

/** A phone number as stored: 3 to 40 digits, spaces and `+-().`, an optional leading `+`; or empty. */
export const USER_PHONE_PATTERN = /^(\+?[\d\s().-]{3,40})?$/
