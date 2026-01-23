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
            // Scoped rules: only match commits for this package
            { scope, type: 'feat', release: 'minor' },
            { scope, type: 'fix', release: 'patch' },
            { scope, type: 'perf', release: 'patch' },
            { scope, type: 'refactor', release: 'patch' },
            { scope, breaking: true, release: 'major' },
            // Catch-all: prevent OTHER scopes from triggering releases
            // Uses negation pattern !(scope) to exclude this package's scope
            { scope: `!(${scope})`, type: 'feat', release: false },
            { scope: `!(${scope})`, type: 'fix', release: false },
            { scope: `!(${scope})`, type: 'perf', release: false },
            { scope: `!(${scope})`, type: 'refactor', release: false },
          ],
        },
      ],
      '@semantic-release/release-notes-generator',
      '@semantic-release/github',
      '@semantic-release/npm',
    ],
  };
};
