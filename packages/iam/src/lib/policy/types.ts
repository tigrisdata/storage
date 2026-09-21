export type Policy = {
  attachmentCount: number;
  createDate: Date;
  defaultVersionId: string;
  description: string;
  id: string;
  name: string;
  path: string;
  resource: string; // ARN
  updateDate: Date;
};

export type PolicyCondition = Record<string, Record<string, string | string[]>>;

export type PolicyStatement = {
  sid?: string;
  effect: string;
  action: string | string[];
  resource: string | string[];
  condition?: PolicyCondition;
};

export type PolicyDocument = {
  version: string;
  statements: PolicyStatement[];
};
