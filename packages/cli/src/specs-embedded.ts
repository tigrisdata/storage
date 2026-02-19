// Embedded specs for binary builds — avoids readFileSync at runtime.
// Only exports loadSpecs(). Helper functions are in utils/specs.ts.

import specsYaml from './specs.yaml' with { type: 'text' };
import * as YAML from 'yaml';
import type { Specs } from './types.js';

let cachedSpecs: Specs | null = null;

export function loadSpecs(): Specs {
  if (!cachedSpecs) {
    cachedSpecs = YAML.parse(specsYaml, { schema: 'core' });
  }
  return cachedSpecs!;
}
