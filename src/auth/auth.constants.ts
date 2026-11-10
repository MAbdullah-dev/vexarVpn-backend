export const INVALID_CREDENTIALS = 'Invalid email or password';
export const DEVICE_REVOKED = 'This device has been revoked';
export const EMAIL_TAKEN = 'An account with this email already exists';
export const TOO_MANY_REQUESTS = 'Too many requests';

/**
 * Access tokens stay valid until their `exp` claim after the refresh-token
 * family is revoked. This default is the longest remaining lifetime when
 * `ACCESS_TOKEN_TTL` is left unset.
 */
export const DEFAULT_ACCESS_TOKEN_TTL = '15m';
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const AUTH_ISSUER = 'vexar-vpn-backend';
export const AUTH_AUDIENCE = 'vexar-android';
