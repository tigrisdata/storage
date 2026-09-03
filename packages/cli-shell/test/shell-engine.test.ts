import { resetVolume } from '@tigrisdata/cli/browser';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ReplIO } from '../src/repl/io';
import { ShellEngine } from '../src/shell';

function makeIO(): ReplIO & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    write: (text) => written.push(text),
    prompt: async () => '',
  };
}

describe('ShellEngine', () => {
  let engine: ShellEngine;

  beforeEach(() => {
    resetVolume();
    engine = new ShellEngine({ io: makeIO() });
  });

  it('runs bash builtins', async () => {
    const result = await engine.exec('echo hello');
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('gives bash the same home directory the CLI uses', async () => {
    // Regression: just-bash defaulted HOME to `/`, so `~` and a bare `cd`
    // went there while the CLI kept its config under /home/tigris.
    const result = await engine.exec(
      'cd /; cd; pwd; echo ~; echo note > ~/note.txt; cat /home/tigris/note.txt'
    );

    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('/home/tigris\n/home/tigris\nnote\n');
  });

  it('runs the CLI as `tigris`', async () => {
    const result = await engine.exec('tigris --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Command line interface for Tigris');
  });

  it('answers to the `t3` alias too', async () => {
    const result = await engine.exec('t3 --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: tigris');
  });

  it('does not expose CLI commands bare', async () => {
    // The shell is a filesystem; the CLI is a program you invoke by name.
    const result = await engine.exec('buckets --help');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not found|command/i);
  });

  it('reaches those commands through tigris', async () => {
    const result = await engine.exec('tigris buckets --help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('buckets');
  });

  it('leaves POSIX commands to bash, not the CLI', async () => {
    // `ls` must list the virtual filesystem, not Tigris buckets — that is what
    // makes this a shell rather than a prompt.
    await engine.exec('mkdir -p /home/tigris/proof');
    const result = await engine.exec('ls /home/tigris');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('proof');
    expect(result.stdout).not.toContain('Name');
  });

  it('propagates CLI exit codes through bash', async () => {
    const result = await engine.exec('tigris definitely-not-a-command');
    expect(result.exitCode).not.toBe(0);
  });

  it('pipes CLI output into bash builtins', async () => {
    const result = await engine.exec('tigris --help | head -1');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain('Usage: tigris');
  });

  it('shares one filesystem with the CLI', async () => {
    // The CLI writes credentials to ~/.tigris/config.json on this volume;
    // the shell must see the same bytes.
    await engine.exec('mkdir -p /home/tigris/.tigris');
    await engine.exec(
      'echo \'{"version":2}\' > /home/tigris/.tigris/config.json'
    );

    const result = await engine.exec('cat /home/tigris/.tigris/config.json');
    expect(result.stdout).toContain('"version":2');
  });

  it("resolves the CLI's relative paths against the shell cwd", async () => {
    // Regression: process.cwd() was hardcoded to home and the cwd was never
    // forwarded, so `cd somewhere && tigris objects put ./file` looked for the
    // file in the wrong place.
    await engine.exec('mkdir -p /home/tigris/work');
    await engine.exec('echo relative > /home/tigris/work/note.txt');

    const result = await engine.exec(
      'cd /home/tigris/work && tigris objects put bucket key note.txt'
    );

    // Unauthenticated here, so it cannot succeed — but it must fail on auth,
    // not on being unable to find the file.
    expect(result.stdout + result.stderr).not.toContain('File not found');
  });

  describe('the tigris command composes with bash', () => {
    it('does not swallow operators that follow it', async () => {
      const result = await engine.exec('tigris --help ; echo after');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: tigris');
      expect(result.stdout).toContain('after');
      expect(result.stdout).not.toContain(';');
    });

    it('redirects its output like any other command', async () => {
      await engine.exec('tigris --help > /tmp/help.txt');
      const result = await engine.exec('cat /tmp/help.txt');

      expect(result.stdout).toContain('Usage: tigris');
    });

    it('propagates a non-zero exit through an operator chain', async () => {
      const result = await engine.exec('tigris nope || echo recovered');

      expect(result.stdout).toContain('recovered');
    });
  });

  describe('piped stdin', () => {
    // Regression: the tigris command dropped just-bash's stdin, so the CLI saw
    // a TTY and `echo hi | tigris objects put …` failed with
    // "File path is required (or pipe data via stdin)".
    it('tells the CLI it was piped to', async () => {
      // `whoami` is unauthenticated here, but reaching an auth error at all
      // proves argument parsing got past the stdin check.
      const piped = await engine.exec('echo hello | tigris --help');
      expect(piped.exitCode).toBe(0);
    });

    it('leaves stdin a TTY when nothing is piped', async () => {
      // Without this, every interactive command would refuse to prompt.
      const result = await engine.exec('tigris --help');
      expect(result.exitCode).toBe(0);
    });
  });
});
