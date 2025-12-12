export default async function stat(options: {
  path?: string;
  _positional?: string[];
}) {
  const path = options.path || options._positional?.[0];

  if (!path) {
    console.error('path argument is required');
    process.exit(1);
  }

  // TODO: Implement stat logic
  console.error('stat command not yet implemented');
  process.exit(1);
}
