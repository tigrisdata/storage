export type TigrisResponse<T, E = Error> =
  | {
      data: T;
      error?: never;
    }
  | {
      error: E;
      data?: never;
    };
