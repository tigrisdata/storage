import { createFsFromVolume, Volume } from 'memfs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type MemfsLike,
  resolvePosix,
  VolumeAdapter,
  type VolumeLike,
} from '../src/fs/volume-adapter';

function makeAdapter() {
  const volume = new Volume();
  const fs = createFsFromVolume(volume);
  fs.mkdirSync('/home/tigris', { recursive: true });
  return {
    volume,
    fs,
    adapter: new VolumeAdapter(
      fs as unknown as MemfsLike,
      volume as unknown as VolumeLike
    ),
  };
}

describe('resolvePosix', () => {
  it('resolves relative paths against the base', () => {
    expect(resolvePosix('/home/tigris', 'notes.txt')).toBe(
      '/home/tigris/notes.txt'
    );
  });

  it('treats a leading slash as absolute', () => {
    expect(resolvePosix('/home/tigris', '/etc/hosts')).toBe('/etc/hosts');
  });

  it('collapses . and ..', () => {
    expect(resolvePosix('/a/b', '../c/./d')).toBe('/a/c/d');
  });

  it('cannot escape the root', () => {
    expect(resolvePosix('/', '../../etc')).toBe('/etc');
  });
});

describe('VolumeAdapter', () => {
  let ctx: ReturnType<typeof makeAdapter>;

  beforeEach(() => {
    ctx = makeAdapter();
  });

  it('round-trips text', async () => {
    await ctx.adapter.writeFile('/home/tigris/a.txt', 'hello');
    expect(await ctx.adapter.readFile('/home/tigris/a.txt')).toBe('hello');
  });

  it('round-trips bytes without decoding them', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await ctx.adapter.writeFile('/home/tigris/bin', bytes);
    expect([...(await ctx.adapter.readFileBuffer('/home/tigris/bin'))]).toEqual(
      [...bytes]
    );
  });

  it('reports stat flags as booleans, not methods', async () => {
    await ctx.adapter.writeFile('/home/tigris/a.txt', 'x');

    const file = await ctx.adapter.stat('/home/tigris/a.txt');
    const dir = await ctx.adapter.stat('/home/tigris');

    // just-bash's FsStat uses booleans where Node's Stats uses methods —
    // getting this wrong makes every path look like a file.
    expect(file.isFile).toBe(true);
    expect(file.isDirectory).toBe(false);
    expect(dir.isDirectory).toBe(true);
    expect(dir.isFile).toBe(false);
    expect(typeof file.isFile).toBe('boolean');
  });

  it('appends rather than overwriting', async () => {
    await ctx.adapter.writeFile('/home/tigris/log', 'one\n');
    await ctx.adapter.appendFile('/home/tigris/log', 'two\n');
    expect(await ctx.adapter.readFile('/home/tigris/log')).toBe('one\ntwo\n');
  });

  it('reports existence', async () => {
    expect(await ctx.adapter.exists('/home/tigris')).toBe(true);
    expect(await ctx.adapter.exists('/nope')).toBe(false);
  });

  it('lists a directory', async () => {
    await ctx.adapter.writeFile('/home/tigris/b.txt', '');
    await ctx.adapter.writeFile('/home/tigris/a.txt', '');
    expect((await ctx.adapter.readdir('/home/tigris')).sort()).toEqual([
      'a.txt',
      'b.txt',
    ]);
  });

  it('tags directory entries with their type', async () => {
    await ctx.adapter.mkdir('/home/tigris/sub', { recursive: true });
    await ctx.adapter.writeFile('/home/tigris/f.txt', '');

    const entries = await ctx.adapter.readdirWithFileTypes('/home/tigris');
    const sub = entries.find((entry) => entry.name === 'sub');
    const file = entries.find((entry) => entry.name === 'f.txt');

    expect(sub?.isDirectory).toBe(true);
    expect(file?.isFile).toBe(true);
  });

  it('copies a directory tree recursively', async () => {
    await ctx.adapter.mkdir('/src/deep', { recursive: true });
    await ctx.adapter.writeFile('/src/top.txt', 'top');
    await ctx.adapter.writeFile('/src/deep/inner.txt', 'inner');

    await ctx.adapter.cp('/src', '/dest', { recursive: true });

    expect(await ctx.adapter.readFile('/dest/top.txt')).toBe('top');
    expect(await ctx.adapter.readFile('/dest/deep/inner.txt')).toBe('inner');
  });

  it('refuses to copy a directory without recursive', async () => {
    await ctx.adapter.mkdir('/src', { recursive: true });
    await expect(ctx.adapter.cp('/src', '/dest')).rejects.toThrow(/EISDIR/);
  });

  it('moves a file', async () => {
    await ctx.adapter.writeFile('/home/tigris/a.txt', 'x');
    await ctx.adapter.mv('/home/tigris/a.txt', '/home/tigris/b.txt');

    expect(await ctx.adapter.exists('/home/tigris/a.txt')).toBe(false);
    expect(await ctx.adapter.readFile('/home/tigris/b.txt')).toBe('x');
  });

  it('removes a tree', async () => {
    await ctx.adapter.mkdir('/tmp/x/y', { recursive: true });
    await ctx.adapter.writeFile('/tmp/x/y/z', '');

    await ctx.adapter.rm('/tmp/x', { recursive: true });

    expect(await ctx.adapter.exists('/tmp/x')).toBe(false);
  });

  it('enumerates paths so globs can match', async () => {
    await ctx.adapter.writeFile('/home/tigris/a.txt', '');
    expect(ctx.adapter.getAllPaths()).toContain('/home/tigris/a.txt');
  });
});
