import { describe, expect, it } from 'vitest';

import { buildAgentSetup } from '../../../src/lib/init/plan.js';

/** The leading "N. " of every top-level step, in order. */
function stepNumbers(recipe: string): number[] {
  return [...recipe.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
}

describe('buildAgentSetup', () => {
  it('leads with an update, not an install, when the CLI is on PATH', () => {
    const recipe = buildAgentSetup(true);
    expect(recipe).toMatch(
      /^1\. Ensure the CLI is on the latest version: `tigris update`\.$/m
    );
    expect(recipe).not.toContain('npm install -g @tigrisdata/cli');
  });

  it('leads with an install, not an update, when the CLI is missing', () => {
    const recipe = buildAgentSetup(false);
    expect(recipe).toMatch(
      /^1\. Ask permission, then install the CLI: `npm install -g @tigrisdata\/cli --ignore-scripts`\.$/m
    );
    expect(recipe).not.toContain('tigris update');
  });

  it('opens with exactly one CLI step in both modes', () => {
    for (const cliInstalled of [true, false]) {
      const recipe = buildAgentSetup(cliInstalled);
      // Step 2 onwards is the shared setup, which never touches the CLI itself.
      expect(recipe).toMatch(
        /^2\. Check if the user is already authenticated/m
      );
    }
  });

  it('numbers steps consecutively from 1 in both modes', () => {
    for (const cliInstalled of [true, false]) {
      const numbers = stepNumbers(buildAgentSetup(cliInstalled));
      expect(numbers.length).toBeGreaterThan(1);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it('swaps the CLI step without changing the step count', () => {
    expect(stepNumbers(buildAgentSetup(false))).toHaveLength(
      stepNumbers(buildAgentSetup(true)).length
    );
  });

  it('keeps every step after the CLI step identical', () => {
    const afterCliStep = (recipe: string) =>
      recipe.split(/^2\. /m)[1] ?? recipe;
    expect(afterCliStep(buildAgentSetup(false))).toBe(
      afterCliStep(buildAgentSetup(true))
    );
  });

  it('indents continuation lines to clear the step number', () => {
    // Steps stay single-digit, so multi-line bodies line up under "N. ".
    const recipe = buildAgentSetup(true);
    expect(stepNumbers(recipe).every((n) => n < 10)).toBe(true);
    expect(recipe).toContain('\n   - Docs:  https://www.tigrisdata.com/docs/');
  });
});
