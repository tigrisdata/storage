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

export interface OperationSpec {
  name: string;
  description: string;
  alias?: string | string[];
  arguments?: Argument[];
  message?: string;
  messages?: Messages;
}

export interface CommandSpec {
  name: string;
  description: string;
  alias?: string;
  arguments?: Argument[];
  operations?: OperationSpec[];
  default?: string;
  message?: string;
  messages?: Messages;
}

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
