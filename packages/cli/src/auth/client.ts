/**
 * Auth0 authentication client for CLI
 * Uses Device Authorization Flow (OAuth 2.0 Device Flow)
 */

import axios from 'axios';
import open from 'open';
import type {
  TokenSet,
  IdTokenClaims,
  TigrisNamespace,
  TigrisOrg,
  OrganizationInfo,
} from './types.js';
import { getAuth0Config, TIGRIS_CLAIMS_NAMESPACE } from './config.js';
import {
  storeTokens,
  getTokens,
  clearTokens,
  storeOrganizations,
  getOrganizations,
  storeLoginMethod,
} from './storage.js';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Auth0 Client wrapper for CLI authentication
 */
export class TigrisAuthClient {
  private config: ReturnType<typeof getAuth0Config>;
  private baseUrl: string;

  constructor() {
    this.config = getAuth0Config();
    this.baseUrl = `https://${this.config.domain}`;
  }

  /**
   * Initiate device authorization flow
   */
  async login(callbacks?: {
    onDeviceCode?: (code: string, uri: string) => void;
    onWaiting?: () => void;
  }): Promise<void> {
    // Start device authorization
    const response = await axios.post<DeviceCodeResponse>(
      `${this.baseUrl}/oauth/device/code`,
      {
        client_id: this.config.clientId,
        audience: this.config.audience,
        scope: 'openid profile email offline_access',
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const deviceCode = response.data;

    // Show device code for confirmation
    callbacks?.onDeviceCode?.(
      deviceCode.user_code,
      deviceCode.verification_uri
    );

    // Delay before opening browser so user can see the code
    await this.sleep(2000);

    // Open browser automatically
    try {
      await open(deviceCode.verification_uri_complete);
    } catch {
      // Browser failed to open, user will need to manually visit the URL
    }

    callbacks?.onWaiting?.();

    // Poll for token
    const tokens = await this.pollForToken(
      deviceCode.device_code,
      deviceCode.interval || 5
    );

    // Store tokens securely
    await storeTokens(tokens);

    // Store login method
    storeLoginMethod('oauth');

    // Extract and store organizations
    await this.extractAndStoreOrganizations(tokens.idToken);
  }

  /**
   * Poll Auth0 for token after device authorization
   */
  private async pollForToken(
    deviceCode: string,
    interval: number
  ): Promise<TokenSet> {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const response = await axios.post<TokenResponse>(
          `${this.baseUrl}/oauth/token`,
          {
            client_id: this.config.clientId,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          },
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }
        );

        const data = response.data;

        // Calculate expiration time
        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          idToken: data.id_token,
          expiresAt,
        };
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response) {
          const errorCode = error.response.data?.error;

          // authorization_pending: User hasn't completed auth yet
          if (errorCode === 'authorization_pending') {
            await this.sleep(interval * 1000);
            continue;
          }

          // slow_down: Polling too fast
          if (errorCode === 'slow_down') {
            interval += 5;
            await this.sleep(interval * 1000);
            continue;
          }

          // Any other error should stop polling
          throw new Error(
            error.response.data?.error_description || 'Authentication failed'
          );
        }

        // Unknown error
        throw error;
      }
    }

    throw new Error('Authentication timed out. Please try again.');
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(): Promise<string> {
    let tokens = await getTokens();

    if (!tokens) {
      throw new Error(
        'Not authenticated. Please run "tigris login" to authenticate.'
      );
    }

    // Check if token is expired or will expire in next 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes
    if (Date.now() + expiryBuffer >= tokens.expiresAt) {
      tokens = await this.refreshAccessToken(tokens);
    }

    return tokens.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(tokens?: TokenSet): Promise<TokenSet> {
    let tokenSet: TokenSet | null = null;
    if (!tokens?.refreshToken) {
      tokenSet = await getTokens();
    } else {
      tokenSet = tokens;
    }

    if (!tokenSet) {
      throw new Error(
        'No refresh token available. Please run "tigris login" to re-authenticate.'
      );
    }

    try {
      const response = await axios.post<TokenResponse>(
        `${this.baseUrl}/oauth/token`,
        {
          client_id: this.config.clientId,
          grant_type: 'refresh_token',
          refresh_token: tokenSet.refreshToken,
          scope: 'openid profile email offline_access',
        },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const data = response.data;

      const newTokens: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokenSet.refreshToken,
        idToken: data.id_token || tokenSet.idToken,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      };

      await storeTokens(newTokens);
      return newTokens;
    } catch (error) {
      // Refresh failed, clear tokens and prompt re-login
      await clearTokens();
      throw new Error(
        'Token refresh failed. Please run "tigris login" to re-authenticate.'
      );
    }
  }

  /**
   * Get ID token claims
   */
  async getIdTokenClaims(): Promise<IdTokenClaims> {
    const tokens = await getTokens();

    if (!tokens || !tokens.idToken) {
      throw new Error(
        'Not authenticated. Please run "tigris login" to authenticate.'
      );
    }

    // Decode JWT (simple base64 decode - already validated by Auth0)
    try {
      const payload = tokens.idToken.split('.')[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error('Failed to decode ID token');
    }
  }

  /**
   * Extract organizations from ID token claims and store them
   */
  async extractAndStoreOrganizations(
    idToken: string | undefined
  ): Promise<void> {
    if (!idToken) {
      return;
    }

    try {
      const payload = idToken.split('.')[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      const claims: IdTokenClaims = JSON.parse(decoded);

      // Extract Tigris namespace
      const tigrisNamespace = claims[TIGRIS_CLAIMS_NAMESPACE] as
        | TigrisNamespace
        | undefined;

      if (!tigrisNamespace) {
        return;
      }

      // Get organizations from 'ns' field
      const availableOrgs: OrganizationInfo[] =
        tigrisNamespace?.ns?.map((org: string | TigrisOrg) => {
          // If org is already an object with id, name, slug
          if (typeof org === 'object' && org !== null) {
            return {
              id: org.id,
              name: org.name,
              displayName: org.name,
            };
          }
          // Otherwise it's a string
          return {
            id: org as string,
            name: org as string,
            displayName: org as string,
          };
        }) || [];

      if (availableOrgs.length === 0) {
        return;
      }

      storeOrganizations(availableOrgs);
    } catch (error) {
      // Silently fail - organizations will need to be fetched another way
    }
  }

  /**
   * Get organizations from stored claims
   */
  async getOrganizations(): Promise<OrganizationInfo[]> {
    // First, ensure we have a valid token
    await this.getAccessToken();

    // Return stored organizations
    return getOrganizations();
  }

  /**
   * Logout and clear all stored data
   */
  async logout(): Promise<void> {
    await clearTokens();
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await getTokens();
    return tokens !== null;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Get singleton instance of auth client
 */
let authClient: TigrisAuthClient | null = null;

export function getAuthClient(): TigrisAuthClient {
  if (!authClient) {
    authClient = new TigrisAuthClient();
  }
  return authClient;
}
