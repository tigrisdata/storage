import type { PolicyDocument } from '@tigrisdata/iam';

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

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
