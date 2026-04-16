import { setBucketNotifications } from '@tigrisdata/storage';
import type { TigrisResponse } from '@shared/types';
import type { TigrisAIConfig } from './config';
import { toStorageConfig } from './config';

// -- Types --

export type SetupCoordinationOptions = {
  /** The bucket to configure notifications on. */
  bucket: string;
  /** Webhook URL to receive notifications. */
  webhookUrl: string;
  /** Optional key filter regex, e.g. `WHERE \`key\` REGEXP "^results/"`. */
  filter?: string;
  /** Optional authentication for the webhook endpoint. */
  auth?:
    | { token: string; username?: never; password?: never }
    | { username: string; password: string; token?: never };
  config?: TigrisAIConfig;
};

export type TeardownCoordinationOptions = {
  bucket: string;
  config?: TigrisAIConfig;
};

// -- Functions --

export async function setupCoordination(
  options: SetupCoordinationOptions
): Promise<TigrisResponse<void>> {
  const { bucket, webhookUrl, filter, auth, config } = options;
  const storageConfig = toStorageConfig(config);

  const result = await setBucketNotifications(bucket, {
    notificationConfig: {
      enabled: true,
      url: webhookUrl,
      filter,
      ...(auth && { auth }),
    },
    config: storageConfig,
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
  options: TeardownCoordinationOptions
): Promise<TigrisResponse<void>> {
  const { bucket, config } = options;
  const storageConfig = toStorageConfig(config);

  const result = await setBucketNotifications(bucket, {
    notificationConfig: { enabled: false },
    config: storageConfig,
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
