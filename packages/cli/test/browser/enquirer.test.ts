import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BrowserHost, setHost } from '../../src/browser/host';
import enquirer from '../../src/browser/shims/enquirer';

function installHost(overrides: Partial<BrowserHost> = {}) {
  const host: BrowserHost = {
    confirm: vi.fn(async () => true),
    input: vi.fn(async () => 'typed'),
    select: vi.fn(async (_message, choices) => choices[0].value),
    ...overrides,
  };
  setHost(host);
  return host;
}

afterEach(() => setHost(null));

describe('enquirer shim', () => {
  it('routes input prompts to host.input', async () => {
    const host = installHost();
    const answers = await enquirer.prompt({
      type: 'input',
      name: 'bucket',
      message: 'Bucket name:',
    });

    expect(answers).toEqual({ bucket: 'typed' });
    expect(host.input).toHaveBeenCalledWith('Bucket name:', {});
  });

  it('re-asks a required input until it gets an answer', async () => {
    // Regression: `required` was read but never enforced, so Enter on
    // "Bucket name:" submitted '' and `buckets create` failed validation.
    const input = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('   ')
      .mockResolvedValueOnce('my-bucket');
    const host = installHost({ input });

    const answers = await enquirer.prompt({
      type: 'input',
      name: 'name',
      message: 'Bucket name:',
      required: true,
    });

    expect(answers).toEqual({ name: 'my-bucket' });
    expect(host.input).toHaveBeenCalledTimes(3);
    expect(host.input).toHaveBeenLastCalledWith('Bucket name: (required)', {});
  });

  it('accepts an empty answer when the field is not required', async () => {
    const host = installHost({ input: vi.fn(async () => '') });

    const answers = await enquirer.prompt({
      type: 'input',
      name: 'note',
      message: 'Note:',
    });

    expect(answers).toEqual({ note: '' });
    expect(host.input).toHaveBeenCalledTimes(1);
  });

  it('re-asks a required password too', async () => {
    const input = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('s3cr3t');
    installHost({ input });

    const answers = await enquirer.prompt({
      type: 'password',
      name: 'secret',
      message: 'Secret Access Key:',
      required: true,
    });

    expect(answers).toEqual({ secret: 's3cr3t' });
    expect(input).toHaveBeenCalledTimes(2);
  });

  it('marks password prompts so the terminal can mask them', async () => {
    const host = installHost();
    await enquirer.prompt({
      type: 'password',
      name: 'secret',
      message: 'Secret:',
    });

    expect(host.input).toHaveBeenCalledWith('Secret:', { password: true });
  });

  it('routes confirm prompts to host.confirm', async () => {
    const host = installHost({ confirm: vi.fn(async () => false) });
    const answers = await enquirer.prompt({
      type: 'confirm',
      name: 'sure',
      message: 'Delete it?',
    });

    expect(answers).toEqual({ sure: false });
    expect(host.confirm).toHaveBeenCalledWith('Delete it?', {});
  });

  it('forwards a confirm default so Enter means what the CLI intends', async () => {
    // `buckets create` asks "Enable snapshots?" with initial: true. Without
    // the default, Enter answered no — the opposite of the CLI.
    const host = installHost();
    await enquirer.prompt({
      type: 'confirm',
      name: 'snapshots',
      message: 'Enable snapshots?',
      initial: true,
    });

    expect(host.confirm).toHaveBeenCalledWith('Enable snapshots?', {
      initial: true,
    });
  });

  it('forwards a select default', async () => {
    const host = installHost();
    await enquirer.prompt({
      type: 'select',
      name: 'tier',
      message: 'Tier:',
      choices: ['STANDARD', 'IA'],
      initial: 1,
    });

    expect(host.select).toHaveBeenCalledWith(
      'Tier:',
      [
        { value: 'STANDARD', label: 'STANDARD' },
        { value: 'IA', label: 'IA' },
      ],
      { initial: 1 }
    );
  });

  it('passes string choices through unchanged', async () => {
    const host = installHost();
    await enquirer.prompt({
      type: 'select',
      name: 'region',
      message: 'Region:',
      choices: ['iad', 'ord'],
    });

    expect(host.select).toHaveBeenCalledWith(
      'Region:',
      [
        { value: 'iad', label: 'iad' },
        { value: 'ord', label: 'ord' },
      ],
      {}
    );
  });

  it('resolves object choices to `name`, matching enquirer', async () => {
    const host = installHost();
    const answers = await enquirer.prompt({
      type: 'select',
      name: 'tier',
      message: 'Tier:',
      choices: [
        { name: 'STANDARD', message: 'Standard - the default' },
        { name: 'IA', message: 'Infrequent Access' },
      ],
    });

    expect(host.select).toHaveBeenCalledWith(
      'Tier:',
      [
        { value: 'STANDARD', label: 'Standard - the default' },
        { value: 'IA', label: 'Infrequent Access' },
      ],
      {}
    );
    expect(answers).toEqual({ tier: 'STANDARD' });
  });

  it('answers each question in an array, keyed by name', async () => {
    installHost({
      input: vi.fn(async (message) =>
        message.startsWith('Key') ? 'AKIA' : 'shh'
      ),
    });

    const answers = await enquirer.prompt([
      { type: 'input', name: 'accessKey', message: 'Key:' },
      { type: 'password', name: 'accessSecret', message: 'Secret:' },
    ]);

    expect(answers).toEqual({ accessKey: 'AKIA', accessSecret: 'shh' });
  });

  it('accepts multiselect answers by number or by name', async () => {
    installHost({ input: vi.fn(async () => '1, ord') });

    const answers = await enquirer.prompt({
      type: 'multiselect',
      name: 'regions',
      message: 'Regions:',
      choices: ['iad', 'ord', 'fra'],
    });

    expect(answers).toEqual({ regions: ['iad', 'ord'] });
  });

  it('names the unsupported prompt type rather than failing silently', async () => {
    installHost();
    await expect(
      enquirer.prompt({ type: 'snippet', name: 'x', message: 'x' })
    ).rejects.toThrow(/snippet/);
  });

  it('explains itself when no host is installed', async () => {
    setHost(null);
    await expect(
      enquirer.prompt({ type: 'input', name: 'x', message: 'x' })
    ).rejects.toThrow(/No browser host installed/);
  });
});
