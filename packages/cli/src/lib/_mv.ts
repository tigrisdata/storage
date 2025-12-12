export default async function mv(options: {
  src?: string;
  dest?: string;
  _positional?: string[];
}) {
  const src = options.src || options._positional?.[0];
  const dest = options.dest || options._positional?.[1];

  if (!src || !dest) {
    console.error('both src and dest arguments are required');
    process.exit(1);
  }

  // TODO: Implement move logic
  console.error('mv command not yet implemented');
  process.exit(1);
}
