import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient } from '../http-client';
import { deleteOrganization } from './delete';

const request = vi.fn();
const session = { sessionToken: 'tok', organizationId: 'org-selected' };

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({ data: { status: 'success', result: {} } });
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

describe('deleteOrganization', () => {
  it('issues DELETE /tigris-iam/namespaces scoped to the target organization', async () => {
    const result = await deleteOrganization('org-doomed', { config: session });

    expect(result).toEqual({ data: { id: 'org-doomed' } });
    // The gateway deletes the session's current organization, so the target
    // is set by scoping the client — overriding whatever is selected.
    expect(createIAMClient).toHaveBeenCalledWith({
      ...session,
      organizationId: 'org-doomed',
    });
    expect(request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/tigris-iam/namespaces',
    });
  });

  it('requires an organization id', async () => {
    const result = await deleteOrganization('', { config: session });
    expect(result.error?.message).toBe('Organization ID is required');
    expect(request).not.toHaveBeenCalled();
  });

  it("surfaces the gateway's error as is", async () => {
    request.mockResolvedValue({
      error: new Error('namespace has 3 buckets'),
    });
    const result = await deleteOrganization('org-doomed', { config: session });
    expect(result.error?.message).toBe('namespace has 3 buckets');
  });

  it('treats an error status in a 200 body as a failure', async () => {
    request.mockResolvedValue({
      data: { status: 'error', message: 'organization is not Tigris native' },
    });
    const result = await deleteOrganization('org-doomed', { config: session });
    expect(result.error?.message).toBe('organization is not Tigris native');
  });
});
