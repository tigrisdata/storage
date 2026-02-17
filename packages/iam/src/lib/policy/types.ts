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

export type PolicyStatement = {
  effect: string;
  action: string | string[];
  resource: string | string[];
};

export type PolicyDocument = {
  version: string;
  statements: PolicyStatement[];
};
