import { TigrisShell } from '@tigrisdata/cli-shell';

// Sign in from inside the shell: `tigris login` offers OAuth or an access key.
export function App() {
  return <TigrisShell />;
}
