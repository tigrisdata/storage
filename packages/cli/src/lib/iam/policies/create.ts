import { existsSync, readFileSync } from 'node:fs';

import { getOAuthIAMConfig } from '@auth/iam.js';
import { addPolicy, type PolicyDocument } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { parseDocument, readStdin } from './utils.js';

const context = msg('iam policies', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const documentArg = getOption<string>(options, ['document', 'd']);
  const description = getOption<string>(options, ['description']) ?? '';

  if (!name) {
    failWithError(context, 'Policy name is required');
  }

  // Validate policy name: only alphanumeric and =,.@_- allowed
  const validNamePattern = /^[a-zA-Z0-9=,.@_-]+$/;
  if (!validNamePattern.test(name)) {
    failWithError(
      context,
      'Invalid policy name. Only alphanumeric characters and =,.@_- are allowed.'
    );
  }

  const iamConfig = await getOAuthIAMConfig(context);

  // Get document content
  let documentJson: string;

  if (documentArg) {
    // Check if it's a file path or inline JSON
    if (existsSync(documentArg)) {
      documentJson = readFileSync(documentArg, 'utf-8');
    } else {
      // Assume it's inline JSON
      documentJson = documentArg;
    }
  } else if (!process.stdin.isTTY) {
    // Read from stdin
    documentJson = await readStdin();
  } else {
    failWithError(
      context,
      'Policy document is required. Provide via --document or pipe to stdin.'
    );
  }

  // Parse and convert document
  let document: PolicyDocument;
  try {
    document = parseDocument(documentJson);
  } catch {
    failWithError(context, 'Invalid JSON in policy document');
  }

  const { data, error } = await addPolicy(name, {
    document,
    description,
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'created', name: data.name, arn: data.resource })
    );
  }

  printSuccess(context, { name: data.name });
  console.log(`Resource: ${data.resource}`);
}
