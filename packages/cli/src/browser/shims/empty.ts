/**
 * Inert stand-in for Node-only dependencies that are reachable from the module
 * graph but never invoked in the browser build: `@aws-sdk/credential-providers`
 * (`fromIni` reads ~/.aws), `@smithy/shared-ini-file-loader`, `@sentry/node`
 * and `@clack/prompts`.
 */

function unavailable(): never {
  throw new Error(
    'This feature is not available in the browser build of Tigris CLI'
  );
}

export const fromIni = () => unavailable();
export const loadSharedConfigFiles = async () => ({
  configFile: {},
  credentialsFile: {},
});
export const getProfileName = () => 'default';
export const init = () => {};
export const captureException = () => {};
export const flush = async () => true;
export default {};
