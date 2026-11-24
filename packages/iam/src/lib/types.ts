import type { TigrisConfig, TigrisResponse } from '@shared/types';

export type TigrisIAMConfig = TigrisConfig & {
  /**
   * STS endpoint that issues temporary credentials. Defaults to
   * `https://sts.storage.dev`, or `TIGRIS_STS_ENDPOINT` when set.
   */
  stsEndpoint?: string;
};

export type TigrisIAMResponse<T, E = Error> = TigrisResponse<T, E>;
