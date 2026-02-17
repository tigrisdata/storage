import { existsSync, readFileSync } from 'node:fs';
import { getOption } from '../../../utils/options.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { addPolicy, type PolicyDocument } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../../utils/messages.js';
import { readStdin, parseDocument } from './utils.js';

const context = msg('iam policies', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const documentArg = getOption<string>(options, ['document', 'd']);
  const description = getOption<string>(options, ['description']) ?? '';

  if (!name) {
    printFailure(context, 'Policy name is required');
    process.exit(1);
  }

  // Validate policy name: only alphanumeric and =,.@_- allowed
  const validNamePattern = /^[a-zA-Z0-9=,.@_-]+$/;
  if (!validNamePattern.test(name)) {
    printFailure(
      context,
      'Invalid policy name. Only alphanumeric characters and =,.@_- are allowed.'
    );
    process.exit(1);
  }

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Policies can only be created when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    process.exit(1);
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    process.exit(1);
  }

  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const tigrisConfig = getTigrisConfig();

  const iamConfig = {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
  };

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
    printFailure(
      context,
      'Policy document is required. Provide via --document or pipe to stdin.'
    );
    process.exit(1);
  }

  // Parse and convert document
  let document: PolicyDocument;
  try {
    document = parseDocument(documentJson);
  } catch {
    printFailure(context, 'Invalid JSON in policy document');
    process.exit(1);
  }

  const { data, error } = await addPolicy(name, {
    document,
    description,
    config: iamConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name: data.name });
  console.log(`Resource: ${data.resource}`);
}
