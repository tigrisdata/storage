import type { TigrisResponse } from '@shared/types';
import { setBucketNotifications } from '@tigrisdata/storage';
import type { TigrisAgentKitConfig } from './config';

// -- Types --

export type SetupCoordinationOptions = {
  /** Webhook URL to receive notifications. */
  webhookUrl: string;
  /** Optional key filter regex, e.g. `WHERE \`key\` REGEXP "^results/"`. */
  filter?: string;
  /** Optional authentication for the webhook endpoint. */
  auth?:
    | { token: string; username?: never; password?: never }
    | { username: string; password: string; token?: never };
  config?: TigrisAgentKitConfig;
};

export type TeardownCoordinationOptions = {
  config?: TigrisAgentKitConfig;
};

// -- Functions --

export async function setupCoordination(
  bucket: string,
  options: SetupCoordinationOptions
): Promise<TigrisResponse<void>> {
  const { webhookUrl, filter, auth, config } = options;

  const result = await setBucketNotifications(bucket, {
    notificationConfig: {
      enabled: true,
      url: webhookUrl,
      filter,
      ...(auth && { auth }),
    },
    config,
  });

  if (result.error) {
    return {
      error: new Error(
        `Failed to setup coordination on "${bucket}": ${result.error.message}`
      ),
    };
  }

  return { data: undefined };
}

export async function teardownCoordination(
  bucket: string,
  options?: TeardownCoordinationOptions
): Promise<TigrisResponse<void>> {
  const { config } = options ?? {};

  const result = await setBucketNotifications(bucket, {
    notificationConfig: {},
    config,
  });

  if (result.error) {
    return {
      error: new Error(
        `Failed to teardown coordination on "${bucket}": ${result.error.message}`
      ),
    };
  }

  return { data: undefined };
}
