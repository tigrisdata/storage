export const addRandomSuffix = (path: string) => {
  const pathParts = path.split('.');
  const extension = pathParts.length > 1 ? pathParts.pop() : '';
  const baseName = pathParts.join('.');
  return `${baseName}-${new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 8)}${extension ? `.${extension}` : ''}`;
};

export const handleError = (error: Error) => {
  let errorMessage: string | undefined;

  if ((error as { Code?: string }).Code === 'AccessDenied') {
    errorMessage = 'Access denied. Please check your credentials.';
  }
  if ((error as { Code?: string }).Code === 'NoSuchKey') {
    errorMessage = 'File not found in Tigris Storage';
  }

  if (errorMessage) {
    return {
      error: new Error(errorMessage),
    };
  }

  return {
    error: new Error(
      error?.message || 'Unexpected error while processing request'
    ),
  };
};
