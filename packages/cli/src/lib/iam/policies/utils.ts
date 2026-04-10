import type { PolicyDocument } from '@tigrisdata/iam';

export { readStdin } from '@utils/options.js';

export function parseDocument(jsonString: string): PolicyDocument {
  const raw = JSON.parse(jsonString);
  return {
    version: raw.Version,
    statements: (Array.isArray(raw.Statement)
      ? raw.Statement
      : [raw.Statement]
    ).map(
      (s: {
        Effect: string;
        Action: string | string[];
        Resource: string | string[];
      }) => ({
        effect: s.Effect,
        action: s.Action,
        resource: s.Resource,
      })
    ),
  };
}
