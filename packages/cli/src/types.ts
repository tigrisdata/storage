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
  type?: 'noun' | 'flag' | string;
  multiple?: boolean;
  examples?: string[];
}

export interface OperationSpec {
  name: string;
  description: string;
  alias?: string | string[];
  arguments?: Argument[];
}

export interface CommandSpec {
  name: string;
  description: string;
  alias?: string;
  arguments?: Argument[];
  operations?: OperationSpec[];
  default?: string;
}

export interface ParsedPath {
  bucket: string;
  path: string;
}

export interface ParsedPaths {
  source: ParsedPath;
  destination: ParsedPath;
}
