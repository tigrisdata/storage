export interface Argument {
  name: string;
  description?: string;
  alias?: string;
  options?:
    | string[]
    | Array<{ name: string; value: string; description: string }>;
  default?: string;
  required?: boolean;
  'required-when'?: string;
  type?: 'positional' | 'flag' | string;
  multiple?: boolean;
  examples?: string[];
  /** Hard-removed: providing the flag exits with a redirect message. */
  removed?: boolean;
  /** Soft-deprecated: still works, but flagged in help and superseded by `replaced_by`. */
  deprecated?: boolean;
  /** Replacement to suggest when a removed or deprecated argument or command is used. */
  replaced_by?: string;
}

export interface NextAction {
  command: string;
  description: string;
}

export interface Messages {
  onStart?: string;
  onSuccess?: string;
  onFailure?: string;
  onEmpty?: string;
  onAlreadyDone?: string;
  onDeprecated?: string;
  hint?: string;
  nextActions?: NextAction[];
}

// Recursive command structure - supports nth level nesting
export interface CommandSpec {
  name: string;
  description?: string;
  alias?: string | string[];
  arguments?: Argument[];
  examples?: string[];
  commands?: CommandSpec[]; // recursive - can nest infinitely
  default?: string;
  deprecated?: boolean;
  /** Hard-removed: invoking the command exits with a redirect message. */
  removed?: boolean;
  /** Replacement to suggest when a removed argument or command is used. */
  replaced_by?: string;
  message?: string;
  messages?: Messages;
}

export interface Specs {
  name: string;
  description: string;
  version: string;
  definitions?: {
    global_arguments?: Argument[];
    [key: string]: unknown;
  };
  commands: CommandSpec[];
}

export interface ParsedPath {
  bucket: string;
  path: string;
}
