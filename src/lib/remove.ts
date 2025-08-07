import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient, TigrisAuthOptions } from './tigris-client';
import { config } from './config';

type RemoveOptions = {
  auth?: TigrisAuthOptions;
};

export async function remove(
  path: string,
  options?: RemoveOptions
): Promise<void> {
  const tigrisClient = createTigrisClient(options?.auth);
  const remove = new DeleteObjectCommand({
    Bucket: options?.auth?.tigrisStorageBucket ?? config.tigrisStorageBucket,
    Key: path,
  });
  await tigrisClient.send(remove);
}
