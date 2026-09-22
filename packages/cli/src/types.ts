export interface Argument {
  name: string;
  description?: string;
  /**
   * Precise one-liner shown beside the argument in help. Falls back to
   * `description`, which stays the full text for the generated docs.
   */
  helpText?: string;
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
  /** Still parsed, but not listed in help. */
  hidden?: boolean;
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
  /**
   * Precise one-liner shown in the parent's command list. Falls back to
   * `description`, which is shown in full on the command's own help page.
   */
  helpText?: string;
  alias?: string | string[];
  /** Heading this command is listed under; one of the parent's `groups`. */
  group?: string;
  /** Headings for this command's subcommand list, in display order. */
  groups?: string[];
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
  /** Headings for the root command list, in display order. */
  groups?: string[];
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
