/**
 * Authentication types
 */

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number; // Unix timestamp
}

export interface IdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

export interface TigrisOrg {
  id: string;
  name: string;
  slug: string;
}

export interface TigrisNamespace {
  ns?: (string | TigrisOrg)[];
  organizations?: (string | TigrisOrg)[];
}

export interface OrganizationInfo {
  id: string;
  name: string;
  displayName?: string;
}
