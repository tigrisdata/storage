import { TigrisClientBase } from '@shared/client/base';
import {
  type BoundOperations,
  bindOperations,
} from '@shared/client/bind-operations';
import type {
  TigrisAuth,
  TigrisCredentials,
  TigrisSession,
} from '@shared/client/init-types';
import type { TigrisResponse } from '@shared/types';
import { DEFAULT_ENDPOINTS } from './config';
import * as iamOperations from './operations';

/**
 * Init options for {@link TigrisIAM}. Deliberately separate from
 * `TigrisIAMConfig` (the bare-function API's config type) — this
 * shape only exists at construct time and is translated into a config
 * per call via {@link TigrisIAM.buildConfig}.
 */
export type TigrisIAMInit = {
  auth: TigrisAuth;
  /** IAM operations hit either endpoint depending on the call; there's no bare-storage `endpoint` concept here. */
  endpoints?: { iamEndpoint?: string; mgmtEndpoint?: string };
};

/**
 * What {@link TigrisIAM.buildConfig} actually, always produces:
 * `iamEndpoint`/`mgmtEndpoint` are always resolved (defaulted); the
 * auth half is exactly what `resolveAuthFields()` returns — a
 * `TigrisCredentials` or a `TigrisSession`, never a mix, and never a
 * `credentialProvider` (the class resolves dynamic auth to a concrete
 * session itself, see `TigrisClientBase`).
 */
type BuiltIAMConfig = {
  iamEndpoint: string;
  mgmtEndpoint: string;
} & (TigrisCredentials | TigrisSession);

/**
 * The public shape of `TigrisIAM` is derived structurally from
 * `./operations`'s own exports — adding a new bare function there and
 * it shows up here (and at runtime, via {@link bindOperations} in the
 * constructor) with no other changes required. Unlike `TigrisStorage`,
 * none of IAM's exports are TS-overloaded, so no hand-written
 * exceptions are needed.
 */
export interface TigrisIAM extends BoundOperations<typeof iamOperations> {}

/**
 * Class-based client for `@tigrisdata/iam`. Wraps every function
 * exported from `./operations` with construct-time auth/endpoint
 * config, so per-call options stay focused on per-call concerns.
 *
 * ```ts
 * const iam = new TigrisIAM({ auth: { accessKeyId, secretAccessKey } });
 * const { data } = await iam.whoami();
 * ```
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional — the interface above types what bindOperations() assigns onto `this` at runtime; no interface-only property is left uninitialized.
export class TigrisIAM extends TigrisClientBase<TigrisIAMInit> {
  constructor(init: TigrisIAMInit) {
    super(init);
    Object.assign(
      this,
      bindOperations(iamOperations, () => this.buildConfig())
    );
  }

  private async buildConfig(): Promise<TigrisResponse<BuiltIAMConfig, Error>> {
    const { data: authFields, error } = await this.resolveAuthFields();
    if (error) return { error };

    return {
      data: {
        iamEndpoint: this.init.endpoints?.iamEndpoint ?? DEFAULT_ENDPOINTS.iam,
        mgmtEndpoint:
          this.init.endpoints?.mgmtEndpoint ?? DEFAULT_ENDPOINTS.mgmt,
        ...authFields,
      },
    };
  }
}
