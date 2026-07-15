import { existsSync, readFileSync } from 'node:fs';

import { getOAuthIAMConfig } from '@auth/iam.js';
import { editPolicy, getPolicy, type PolicyDocument } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';
import { parseDocument, readStdin } from './utils.js';

const context = msg('iam policies', 'edit');

export default async function edit(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let resource = getOption<string>(options, ['resource']);
  const documentArg = getOption<string>(options, ['document', 'd']);
  const description = getOption<string>(options, ['description']);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    if (!process.stdin.isTTY) {
      failWithError(
        context,
        'Policy ARN is required when piping document via stdin.'
      );
    }

    const selected = await selectPolicy(
      iamConfig,
      context,
      'Select a policy to edit:'
    );
    if (!selected) return;
    resource = selected;
  }

  // Get document content (optional if only updating description)
  let newDocument: PolicyDocument | undefined;

  if (documentArg) {
    // Check if it's a file path or inline JSON
    let documentJson: string;
    if (existsSync(documentArg)) {
      documentJson = readFileSync(documentArg, 'utf-8');
    } else {
      // Assume it's inline JSON
      documentJson = documentArg;
    }
    try {
      newDocument = parseDocument(documentJson);
    } catch {
      failWithError(context, 'Invalid JSON in policy document');
    }
  } else if (!process.stdin.isTTY && !description) {
    // Read from stdin only if no description provided (description-only update doesn't need stdin)
    const documentJson = await readStdin();
    try {
      newDocument = parseDocument(documentJson);
    } catch {
      failWithError(context, 'Invalid JSON in policy document');
    }
  }

  if (!newDocument && !description) {
    failWithError(context, 'Either --document or --description is required.');
  }

  // Fetch existing policy to fill in missing values
  const { data: existingPolicy, error: getError } = await getPolicy(resource, {
    config: iamConfig,
  });

  if (getError) {
    failWithError(context, getError);
  }

  const { data, error } = await editPolicy(resource, {
    document: newDocument ?? existingPolicy.document,
    description: description ?? existingPolicy.description,
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', arn: data.resource }));
  }

  printSuccess(context, { resource: data.resource });
}
