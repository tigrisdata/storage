import type { TigrisConfig, TigrisResponse } from '@shared/types';

export type TigrisIAMConfig = TigrisConfig;

export type TigrisIAMResponse<T, E = Error> = TigrisResponse<T, E>;
