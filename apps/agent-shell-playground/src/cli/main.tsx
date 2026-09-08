import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xterm/xterm/css/xterm.css';
import '@tigrisdata/cli-shell/styles.css';

import { type Auth0Options, TigrisShell } from '@tigrisdata/cli-shell';

/**
 * Keep only the keys that are set, so the component's own defaults survive
 * when the .env is absent (a plain checkout with no dev credentials).
 */
function present(
  values: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    )
  );
}

// Tenant and endpoints come from the repo-root .env; vite.config.ts lists
// exactly which keys are exposed. Sign in from inside the shell with
// `tigris login`, which offers OAuth or an access key.
const env = import.meta.env;

const auth: Auth0Options = present({
  domain: env.TIGRIS_AUTH0_DOMAIN,
  clientId: env.TIGRIS_AUTH0_CLIENT_ID,
  audience: env.TIGRIS_AUTH0_AUDIENCE,
  claimsNamespace: env.TIGRIS_CLAIMS_NAMESPACE,
});

const cliEnv = present({
  TIGRIS_STORAGE_ENDPOINT: env.TIGRIS_STORAGE_ENDPOINT,
  TIGRIS_IAM_ENDPOINT: env.TIGRIS_IAM_ENDPOINT,
  TIGRIS_MGMT_ENDPOINT: env.TIGRIS_MGMT_ENDPOINT,
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <TigrisShell auth={auth} env={cliEnv} />
  </StrictMode>
);
