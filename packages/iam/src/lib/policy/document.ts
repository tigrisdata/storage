import type { PolicyCondition, PolicyDocument } from './types';

export type ApiPolicyStatement = {
  Sid?: string;
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
  Condition?: PolicyCondition;
};

export type ApiPolicyDocument = {
  Version: string;
  Statement: ApiPolicyStatement[];
};

export function toApiDocument(document: PolicyDocument): ApiPolicyDocument {
  return {
    Version: document.version,
    Statement: document.statements.map((s) => ({
      ...(s.sid !== undefined && { Sid: s.sid }),
      Effect: s.effect,
      Action: s.action,
      Resource: s.resource,
      ...(s.condition !== undefined && { Condition: s.condition }),
    })),
  };
}

export function fromApiDocument(jsonString: string): PolicyDocument {
  const raw = JSON.parse(jsonString);
  const statements: ApiPolicyStatement[] = Array.isArray(raw.Statement)
    ? raw.Statement
    : [raw.Statement];

  return {
    version: raw.Version,
    statements: statements.map((s) => ({
      ...(s.Sid !== undefined && { sid: s.Sid }),
      effect: s.Effect,
      action: s.Action,
      resource: s.Resource,
      ...(s.Condition !== undefined && { condition: s.Condition }),
    })),
  };
}
