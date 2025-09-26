export const addRandomSuffix = (path: string) => {
  const pathParts = path.split('.');
  const extension = pathParts.length > 1 ? pathParts.pop() : '';
  const baseName = pathParts.join('.');
  return `${baseName}-${new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 8)}${extension ? `.${extension}` : ''}`;
};
