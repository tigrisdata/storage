import type { NextAction } from '../types.js';

export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  AuthFailure = 2,
  NotFound = 3,
  RateLimit = 4,
  NetworkError = 5,
}

export type ErrorCategory =
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'general';

export interface ClassifiedError {
  exitCode: ExitCode;
  category: ErrorCategory;
  message: string;
  nextActions: NextAction[];
}

// Pattern groups ordered by priority (auth > permission > not_found > rate_limit > network > general)
// AUTH = not logged in at all; PERMISSION = logged in but lacks access to resource
const AUTH_PATTERNS: RegExp[] = [
  /not authenticated/i,
  /no organization selected/i,
  /token refresh failed/i,
  /please run "tigris login/i,
  /logged in via OAuth/i,
];

const PERMISSION_PATTERNS: RegExp[] = [/access denied/i, /forbidden/i];

const NOT_FOUND_PATTERNS: RegExp[] = [
  /NoSuchBucket/,
  /NoSuchKey/,
  /bucket not found/i,
  /object not found/i,
  /resource .+ does not exist/i,
  /the specified key does not exist/i,
];

const RATE_LIMIT_PATTERNS: RegExp[] = [
  /rate limit/i,
  /too many requests/i,
  /throttl/i,
  /SlowDown/,
];

const NETWORK_PATTERNS: RegExp[] = [
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /socket hang up/i,
  /fetch failed/i,
];

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(message));
}

function getAuthNextActions(): NextAction[] {
  return [
    { command: 'tigris login', description: 'Authenticate via OAuth' },
    {
      command: 'tigris configure',
      description: 'Set up access key credentials',
    },
  ];
}

function getPermissionNextActions(): NextAction[] {
  return [
    {
      command: 'tigris access-keys list',
      description: 'Check your access key permissions',
    },
    { command: 'tigris login', description: 'Re-authenticate if needed' },
  ];
}

function getNotFoundNextActions(): NextAction[] {
  return [{ command: 'tigris ls', description: 'List available buckets' }];
}

function getRateLimitNextActions(): NextAction[] {
  return [];
}

function getNetworkNextActions(): NextAction[] {
  return [
    {
      command: 'tigris credentials test',
      description: 'Test connectivity and credentials',
    },
  ];
}

/**
 * Classify an error by pattern-matching its message.
 * Returns a ClassifiedError with the appropriate exit code, category,
 * and suggested next actions for agents.
 */
function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (hasMessage(error)) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return 'Unknown error';
  return String(error);
}

export function classifyError(error: unknown): ClassifiedError {
  const message = extractMessage(error);

  if (matchesAny(message, AUTH_PATTERNS)) {
    return {
      exitCode: ExitCode.AuthFailure,
      category: 'auth',
      message,
      nextActions: getAuthNextActions(),
    };
  }

  if (matchesAny(message, PERMISSION_PATTERNS)) {
    return {
      exitCode: ExitCode.AuthFailure,
      category: 'permission',
      message,
      nextActions: getPermissionNextActions(),
    };
  }

  if (matchesAny(message, NOT_FOUND_PATTERNS)) {
    return {
      exitCode: ExitCode.NotFound,
      category: 'not_found',
      message,
      nextActions: getNotFoundNextActions(),
    };
  }

  if (matchesAny(message, RATE_LIMIT_PATTERNS)) {
    return {
      exitCode: ExitCode.RateLimit,
      category: 'rate_limit',
      message,
      nextActions: getRateLimitNextActions(),
    };
  }

  if (matchesAny(message, NETWORK_PATTERNS)) {
    return {
      exitCode: ExitCode.NetworkError,
      category: 'network',
      message,
      nextActions: getNetworkNextActions(),
    };
  }

  return {
    exitCode: ExitCode.GeneralError,
    category: 'general',
    message,
    nextActions: [],
  };
}
