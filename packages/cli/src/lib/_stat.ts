import { parseAnyPath } from '../utils/path.js';

export default async function stat(options: {
  path?: string;
  _positional?: string[];
}) {
  const pathString = options.path || options._positional?.[0];

  if (!pathString) {
    console.error('path argument is required');
    process.exit(1);
  }

  const { bucket } = parseAnyPath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  // TODO: Implement stat logic
  console.error('stat command not yet implemented');
  process.exit(1);
}
