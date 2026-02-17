export interface Argument {
  name: string;
  description: string;
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
}

export interface Messages {
  onStart?: string;
  onSuccess?: string;
  onFailure?: string;
  onEmpty?: string;
  onAlreadyDone?: string;
  hint?: string;
}

// Recursive command structure - supports nth level nesting
export interface CommandSpec {
  name: string;
  description: string;
  alias?: string | string[];
  arguments?: Argument[];
  examples?: string[];
  commands?: CommandSpec[]; // recursive - can nest infinitely
  default?: string;
  message?: string;
  messages?: Messages;
}

// Backwards compatibility alias
export type OperationSpec = CommandSpec;

export interface Specs {
  name: string;
  description: string;
  version: string;
  commands: CommandSpec[];
}

export interface ParsedPath {
  bucket: string;
  path: string;
}

export interface ParsedPaths {
  source: ParsedPath;
  destination: ParsedPath;
}
