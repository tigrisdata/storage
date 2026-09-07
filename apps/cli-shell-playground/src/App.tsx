import { TigrisShell } from '@tigrisdata/cli-shell';

declare const __PREFILL__: { accessKeyId: string; secretAccessKey: string };

export function App() {
  const prefill =
    typeof __PREFILL__ === 'undefined'
      ? { accessKeyId: '', secretAccessKey: '' }
      : __PREFILL__;

  // Pre-fills from the repo-root .env in dev so the shell is usable straight
  // away; without it, sign in from inside the shell with `login`.
  const accessKey = prefill.accessKeyId ? prefill : undefined;

  return <TigrisShell accessKey={accessKey} />;
}
