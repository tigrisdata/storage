const DEFAULT_PART_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PARTS = 10_000; // S3 hard limit
const DEFAULT_QUEUE_SIZE = 10; // matches AWS CLI max_concurrent_requests

export function calculateUploadParams(fileSize?: number) {
  if (!fileSize || fileSize <= DEFAULT_PART_SIZE) {
    return { multipart: false } as const;
  }

  let partSize = DEFAULT_PART_SIZE;

  // Increase part size if needed to stay under S3's 10K part limit
  if (fileSize / partSize > MAX_PARTS) {
    partSize = Math.ceil(fileSize / MAX_PARTS);
  }

  return { multipart: true, partSize, queueSize: DEFAULT_QUEUE_SIZE } as const;
}
