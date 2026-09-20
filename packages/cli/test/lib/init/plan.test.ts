import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderAgentSetupMarkdown } from '../../../scripts/generate-agent-setup.js';
import {
  AGENT_PROMPT_URL,
  buildAgentPrompt,
  buildAgentSetup,
} from '../../../src/lib/init/plan.js';
import { SUPPORTED_EDITORS } from '../../../src/lib/init/shared.js';

/** The leading "N. " of every top-level step, in order. */
function stepNumbers(recipe: string): number[] {
  return [...recipe.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
}

describe('buildAgentSetup', () => {
  it('leads with an update, not an install, when the CLI is on PATH', () => {
    const recipe = buildAgentSetup(true);
    expect(recipe).toMatch(
      /^1\. Update the CLI to the latest version: `tigris update`\.$/m
    );
    expect(recipe).not.toContain('npm install -g @tigrisdata/cli');
  });

  it('leads with an install, not an update, when the CLI is missing', () => {
    const recipe = buildAgentSetup(false);
    expect(recipe).toMatch(
      /^1\. Ask the user for permission\. Then install the CLI: `npm install -g @tigrisdata\/cli --ignore-scripts`\.$/m
    );
    expect(recipe).not.toContain('tigris update');
  });

  it('opens with exactly one CLI step in both modes', () => {
    for (const cliInstalled of [true, false]) {
      const recipe = buildAgentSetup(cliInstalled);
      // Step 2 onwards is the shared setup, which never touches the CLI itself.
      expect(recipe).toMatch(/^2\. Configure the Tigris MCP server/m);
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

  it('has the agent configure itself with a non-interactive init', () => {
    const recipe = buildAgentSetup(true);
    expect(recipe).toContain('`tigris init --yes`');
    expect(recipe).toContain('`tigris init --editor <id>`');
    // Every editor `--editor` accepts is listed, so the agent can name itself.
    for (const editor of SUPPORTED_EDITORS) {
      expect(recipe).toContain(editor.id);
    }
  });

  it('infers a bucket name by default', () => {
    const recipe = buildAgentSetup(true);
    expect(recipe).toContain('Read the project name');
    expect(recipe).not.toContain('already exists');
  });

  it('uses the given bucket instead of creating one', () => {
    const recipe = buildAgentSetup(true, { bucket: 'moon-ray-b28b' });
    expect(recipe).toContain(
      '`tigris buckets get moon-ray-b28b --format json`'
    );
    expect(recipe).toContain('Do not create a different bucket');
    expect(recipe).not.toContain('Read the project name');
    // Same number of steps either way — only the bucket step changes.
    expect(stepNumbers(recipe)).toEqual(stepNumbers(buildAgentSetup(true)));
  });

  it('connects existing projects and tests the result', () => {
    const recipe = buildAgentSetup(true);
    expect(recipe).toContain('If the project has an S3 client');
    expect(recipe).toContain('ask the user for permission to add a dependency');
    expect(recipe).toContain('Test the configuration');
    expect(recipe).toContain('`.gitignore` includes `.env`');
  });

  it('indents continuation lines to clear the step number', () => {
    // Steps stay single-digit, so multi-line bodies line up under "N. ".
    const recipe = buildAgentSetup(true);
    expect(stepNumbers(recipe).every((n) => n < 10)).toBe(true);
    expect(recipe).toContain('\n   - Docs:  https://www.tigrisdata.com/docs/');
  });
});

describe('buildAgentPrompt', () => {
  it('is one paste for any agent, with a no-shell fallback', () => {
    const prompt = buildAgentPrompt();
    expect(prompt).toContain('Run `npx tigris init --agent`');
    expect(prompt).toContain(AGENT_PROMPT_URL);
    expect(prompt).not.toMatch(/\n/);
  });

  it('uses the installed CLI when told it is there', () => {
    expect(buildAgentPrompt({ cli: 'tigris' })).toContain(
      'Run `tigris init --agent`'
    );
  });

  it('carries the bucket through to the recipe flag', () => {
    const prompt = buildAgentPrompt({ bucket: 'moon-ray-b28b' });
    expect(prompt).toContain('init --agent --bucket moon-ray-b28b');
    expect(prompt).toContain('`moon-ray-b28b`. It already exists');
  });
});

describe('AGENT-SETUP.md', () => {
  /**
   * The published copy of the recipe — what the prompt's "if you cannot run
   * commands" URL serves. Generated by `npm run generate:agent-setup`; this
   * keeps it from drifting behind plan.ts.
   */
  it('matches the recipe for a machine without the CLI', () => {
    const published = readFileSync(
      resolve(__dirname, '../../../AGENT-SETUP.md'),
      'utf8'
    );
    expect(published).toBe(renderAgentSetupMarkdown());
  });
});
