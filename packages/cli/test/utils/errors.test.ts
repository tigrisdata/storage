import { describe, expect, it } from 'vitest';

import {
  type ClassifiedError,
  classifyError,
  ExitCode,
} from '../../src/utils/errors.js';

describe('classifyError', () => {
  describe('auth errors (exit code 2)', () => {
    const authMessages = [
      'not authenticated',
      'Not Authenticated - please login',
      'No organization selected',
      'Token refresh failed',
      'Please run "tigris login" to authenticate',
      'Policies can only be created when logged in via OAuth.',
      'Users can only be invited when logged in via OAuth.\nRun "tigris login oauth" first.',
    ];

    for (const msg of authMessages) {
      it(`classifies "${msg}" as auth`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.AuthFailure);
        expect(result.category).toBe('auth');
        expect(result.nextActions.length).toBeGreaterThan(0);
        expect(
          result.nextActions.some((a) => a.command.includes('login'))
        ).toBe(true);
      });
    }
  });

  describe('permission errors (exit code 2)', () => {
    const permissionMessages = [
      'Access Denied',
      'access denied to resource',
      'Forbidden',
      '403 Forbidden',
    ];

    for (const msg of permissionMessages) {
      it(`classifies "${msg}" as permission`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.AuthFailure);
        expect(result.category).toBe('permission');
        expect(result.nextActions.length).toBeGreaterThan(0);
        expect(
          result.nextActions.some((a) => a.command.includes('access-keys'))
        ).toBe(true);
      });
    }
  });

  describe('not found errors (exit code 3)', () => {
    const notFoundMessages = [
      'Bucket not found',
      'NoSuchBucket',
      'NoSuchKey',
      'Resource xyz does not exist',
      'The specified key does not exist',
      'Object not found in bucket',
    ];

    for (const msg of notFoundMessages) {
      it(`classifies "${msg}" as not_found`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.NotFound);
        expect(result.category).toBe('not_found');
        expect(result.nextActions.length).toBeGreaterThan(0);
        expect(result.nextActions.some((a) => a.command.includes('ls'))).toBe(
          true
        );
      });
    }
  });

  describe('rate limit errors (exit code 4)', () => {
    const rateLimitMessages = [
      'Rate limit exceeded',
      'Too many requests',
      'Request throttled',
      'SlowDown',
    ];

    for (const msg of rateLimitMessages) {
      it(`classifies "${msg}" as rate_limit`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.RateLimit);
        expect(result.category).toBe('rate_limit');
        expect(result.nextActions).toEqual([]);
      });
    }
  });

  describe('network errors (exit code 5)', () => {
    const networkMessages = [
      'connect ECONNREFUSED 127.0.0.1:443',
      'getaddrinfo ENOTFOUND api.example.com',
      'connect ETIMEDOUT 1.2.3.4:443',
      'read ECONNRESET',
      'socket hang up',
      'fetch failed',
    ];

    for (const msg of networkMessages) {
      it(`classifies "${msg}" as network`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.NetworkError);
        expect(result.category).toBe('network');
        expect(result.nextActions.length).toBeGreaterThan(0);
        expect(
          result.nextActions.some((a) => a.command.includes('credentials test'))
        ).toBe(true);
      });
    }
  });

  describe('general errors (exit code 1)', () => {
    const generalMessages = [
      'Bucket name is required',
      'Invalid argument',
      'Something unexpected happened',
      'Source not found: ./myfile',
      'File not found: ./report.pdf',
      '',
    ];

    for (const msg of generalMessages) {
      it(`classifies "${msg || '(empty)'}" as general`, () => {
        const result = classifyError(new Error(msg));
        expect(result.exitCode).toBe(ExitCode.GeneralError);
        expect(result.category).toBe('general');
        expect(result.nextActions).toEqual([]);
      });
    }
  });

  describe('priority ordering', () => {
    it('auth takes priority over permission when both match', () => {
      // "not authenticated, access denied" matches both auth and permission
      const result = classifyError(
        new Error('not authenticated, access denied')
      );
      expect(result.exitCode).toBe(ExitCode.AuthFailure);
      expect(result.category).toBe('auth');
    });

    it('permission takes priority over not_found when both match', () => {
      // "access denied: resource not found" matches both permission and not_found
      const result = classifyError(
        new Error('access denied: resource not found')
      );
      expect(result.exitCode).toBe(ExitCode.AuthFailure);
      expect(result.category).toBe('permission');
    });
  });

  describe('input types', () => {
    it('handles Error objects', () => {
      const result = classifyError(new Error('NoSuchBucket'));
      expect(result.exitCode).toBe(ExitCode.NotFound);
    });

    it('handles plain objects with message property (SDK errors)', () => {
      const sdkError = { message: 'NoSuchBucket', code: 'NoSuchBucket' };
      const result = classifyError(sdkError);
      expect(result.exitCode).toBe(ExitCode.NotFound);
      expect(result.message).toBe('NoSuchBucket');
    });

    it('handles string errors', () => {
      const result = classifyError('NoSuchBucket');
      expect(result.exitCode).toBe(ExitCode.NotFound);
    });

    it('handles undefined', () => {
      const result = classifyError(undefined);
      expect(result.exitCode).toBe(ExitCode.GeneralError);
      expect(result.message).toBe('Unknown error');
    });

    it('handles null', () => {
      const result = classifyError(null);
      expect(result.exitCode).toBe(ExitCode.GeneralError);
    });

    it('handles number', () => {
      const result = classifyError(42);
      expect(result.exitCode).toBe(ExitCode.GeneralError);
      expect(result.message).toBe('42');
    });
  });

  describe('ClassifiedError structure', () => {
    it('always has all required fields', () => {
      const result: ClassifiedError = classifyError(new Error('test'));
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('nextActions');
      expect(Array.isArray(result.nextActions)).toBe(true);
    });

    it('nextActions have command and description', () => {
      const result = classifyError(new Error('access denied'));
      for (const action of result.nextActions) {
        expect(action).toHaveProperty('command');
        expect(action).toHaveProperty('description');
        expect(typeof action.command).toBe('string');
        expect(typeof action.description).toBe('string');
      }
    });
  });
});
