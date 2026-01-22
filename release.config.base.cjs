/**
 * Base semantic-release configuration for @tigrisdata packages
 * @param {string} packageName - The package name (e.g., '@tigrisdata/storage')
 */
module.exports = (packageName) => {
  // Extract scope from package name: '@tigrisdata/storage' -> 'storage'
  const scope = packageName.replace('@tigrisdata/', '');

  return {
    branches: ['main', { name: 'next', prerelease: true }],
    tagFormat: `${packageName}@\${version}`,
    plugins: [
      [
        '@semantic-release/commit-analyzer',
        {
          releaseRules: [
            { scope, type: 'feat', release: 'minor' },
            { scope, type: 'fix', release: 'patch' },
            { scope, type: 'perf', release: 'patch' },
            { scope, type: 'refactor', release: 'patch' },
            { scope, breaking: true, release: 'major' },
          ],
        },
      ],
      '@semantic-release/release-notes-generator',
      '@semantic-release/github',
      '@semantic-release/npm',
    ],
  };
};
