import { beforeEach, describe, expect, it } from 'vitest';

import { fs, HOME_DIR, resetVolume, volume } from '../../src/browser/volume';

describe('browser volume', () => {
  beforeEach(() => resetVolume());

  it('seeds the home and tmp directories the CLI expects', () => {
    expect(fs.existsSync(HOME_DIR)).toBe(true);
    expect(fs.existsSync('/tmp')).toBe(true);
  });

  it('round-trips the credential file auth/storage.ts writes', () => {
    fs.mkdirSync(`${HOME_DIR}/.tigris`, { recursive: true });
    fs.writeFileSync(
      `${HOME_DIR}/.tigris/config.json`,
      JSON.stringify({ version: 2 })
    );

    expect(
      JSON.parse(
        fs.readFileSync(`${HOME_DIR}/.tigris/config.json`, 'utf8') as string
      )
    ).toEqual({ version: 2 });
  });

  it('keeps nothing after a reset, so credentials cannot outlive a session', () => {
    fs.writeFileSync(`${HOME_DIR}/secret`, 'AKIA');
    expect(fs.existsSync(`${HOME_DIR}/secret`)).toBe(true);

    resetVolume();

    expect(fs.existsSync(`${HOME_DIR}/secret`)).toBe(false);
    expect(Object.keys(volume.toJSON())).not.toContain(`${HOME_DIR}/secret`);
  });
});
