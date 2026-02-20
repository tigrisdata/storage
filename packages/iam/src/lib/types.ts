import type { TigrisResponse } from '@shared/types';

export type TigrisIAMConfig = {
  sessionToken?: string;
  organizationId?: string;
  iamEndpoint?: string;
  mgmtEndpoint?: string;
};

export type TigrisIAMResponse<T, E = Error> = TigrisResponse<T, E>;
