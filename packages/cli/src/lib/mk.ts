export default async function mk(options: {
  path?: string;
  _positional?: string[];
}) {
  const path = options.path || options._positional?.[0];

  if (!path) {
    console.error('path argument is required');
    process.exit(1);
  }

  // TODO: Implement create logic
  console.error('mk command not yet implemented');
  process.exit(1);
}
