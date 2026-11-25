/**
 * Whether this run authenticates with temporary credentials. Set when the auth
 * method is resolved, and read by error reporting: temporary credentials only
 * allow what their policy grants, on one bucket, which is the likely reason
 * behind an "Access Denied".
 */
let usingTemporaryCredentials = false;

export function setUsingTemporaryCredentials(value: boolean) {
  usingTemporaryCredentials = value;
}

export function isUsingTemporaryCredentials(): boolean {
  return usingTemporaryCredentials;
}
