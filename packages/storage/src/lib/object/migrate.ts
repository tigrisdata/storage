import { HeadObjectCommand } from '@aws-sdk/client-s3';
import type { HttpRequest, HttpResponse } from '@aws-sdk/types';
import { handleError, TigrisHeaders } from '@shared/index';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type MigrateOptions = {
  config?: TigrisStorageConfig;
};

export async function migrate(
  path: string,
  options?: MigrateOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const head = new HeadObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  head.middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers[TigrisHeaders.SCHEDULE_MIGRATION] = 'true';
      const result = await next(args);
      return result;
    },
    {
      step: 'build',
    }
  );

  try {
    return tigrisClient
      .send(head)
      .then(async () => {
        return {
          data: undefined,
        };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}

export async function isMigrated(
  path: string,
  options?: MigrateOptions
): Promise<TigrisStorageResponse<boolean, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const head = new HeadObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  let responseHeaders: Record<string, string> = {};

  head.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      responseHeaders = (result.response as HttpResponse).headers;

      return result;
    },
    {
      step: 'deserialize',
    }
  );

  try {
    return tigrisClient
      .send(head)
      .then(async () => {
        return {
          data:
            responseHeaders[TigrisHeaders.READ_SOURCE.toLowerCase()]?.toLowerCase() !==
            'block_shadow',
        };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}
