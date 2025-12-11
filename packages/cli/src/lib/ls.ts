export default async function ls(options: {
  path?: string;
  _positional?: string[];
}) {
  const path = options.path || options._positional?.[0];

  if (!path) {
    console.error('path argument is required');
    process.exit(1);
  }

  // TODO: Implement listing logic
  console.error('ls command not yet implemented');
  process.exit(1);
}
