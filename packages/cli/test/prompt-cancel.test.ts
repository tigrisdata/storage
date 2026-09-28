import { describe, expect, it } from 'vitest';

import { isPromptCancellation } from '../src/cli-core.js';

describe('cancelling a prompt', () => {
  it('is what enquirer and a closed readline report', () => {
    expect(isPromptCancellation('')).toBe(true);
    expect(isPromptCancellation(undefined)).toBe(true);
    expect(
      isPromptCancellation(
        Object.assign(new Error('readline was closed'), {
          code: 'ERR_USE_AFTER_CLOSE',
        })
      )
    ).toBe(true);
  });

  it('is not any other failure', () => {
    expect(isPromptCancellation(new Error('boom'))).toBe(false);
    expect(isPromptCancellation({ code: 'ENOENT' })).toBe(false);
    expect(isPromptCancellation(null)).toBe(false);
    expect(isPromptCancellation('some reason')).toBe(false);
  });
});
