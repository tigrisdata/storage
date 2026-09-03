import { describe, expect, it, vi } from 'vitest';

import { PROMPT_CANCELLED } from '../src/repl/io';
import { TerminalLoop } from '../src/repl/loop';

/** Minimal xterm stand-in that records everything written. */
function makeTerminal() {
  const writes: string[] = [];
  let handler: ((data: string) => void) | undefined;

  return {
    writes,
    output: () => writes.join(''),
    send: (data: string) => handler?.(data),
    terminal: {
      write: (text: string) => writes.push(text),
      onData: (fn: (data: string) => void) => {
        handler = fn;
      },
      clear: vi.fn(),
      focus: vi.fn(),
      cols: 80,
    },
  };
}

type Handle = (
  line: string,
  io: { write(text: string): void }
) => Promise<void>;

function makeLoop(handle: Handle = async () => {}) {
  const term = makeTerminal();
  const session = {
    promptText: '/home/tigris $ ',
    shellCommands: [],
    handle,
    currentDirectory: '/home/tigris',
    resetDirectory: vi.fn(),
  };

  const loop = new TerminalLoop({
    // biome-ignore lint/suspicious/noExplicitAny: test doubles
    terminal: term.terminal as any,
    // biome-ignore lint/suspicious/noExplicitAny: test doubles
    engine: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: test doubles
    session: session as any,
  });

  return { loop, term, session, handle };
}

describe('TerminalLoop output handling', () => {
  it('translates LF to CRLF, which xterm requires', () => {
    const { loop, term } = makeLoop();
    loop.io.write('one\ntwo\n');
    expect(term.output()).toBe('one\r\ntwo\r\n');
  });

  it('does not double up CRLF that is already correct', () => {
    const { loop, term } = makeLoop();
    loop.io.write('one\r\n');
    expect(term.output()).toBe('one\r\n');
  });

  it('keeps output that does not end in a newline', async () => {
    // Regression: the prompt starts with \r\x1b[K, which clears the line it
    // lands on. `head -c 8` emitting exactly "%PDF-1.4" was being erased.
    const { loop, term } = makeLoop(async (_line, io) => {
      io.write('%PDF-1.4');
    });

    loop.start();
    term.writes.length = 0;

    for (const char of 'x') term.send(char);
    term.send('\r');
    await vi.waitFor(() => expect(term.output()).toContain('%PDF-1.4'));

    const output = term.output();
    const promptAt = output.lastIndexOf('/home/tigris $');
    const outputAt = output.indexOf('%PDF-1.4');

    expect(outputAt).toBeGreaterThan(-1);
    expect(promptAt).toBeGreaterThan(outputAt);
    // A newline must separate them, or the prompt's clear wipes the output.
    expect(output.slice(outputAt + '%PDF-1.4'.length, promptAt)).toContain(
      '\r\n'
    );
  });

  it('echoes stars, not characters, for a secret prompt', async () => {
    // Regression: every keystroke was echoed, so an access-key secret typed at
    // `tigris login` landed in terminal scrollback in clear text.
    const { loop, term } = makeLoop();
    loop.start();

    const answer = loop.io.prompt('Secret Access Key:', { password: true });
    term.writes.length = 0;

    for (const char of 'hunter2') term.send(char);

    const echoed = term.output();
    expect(echoed).not.toContain('hunter2');
    expect(echoed).toContain('*******');

    term.send('\r');
    expect(await answer).toBe('hunter2');
  });

  it('still echoes ordinary prompts', async () => {
    const { loop, term } = makeLoop();
    loop.start();

    const answer = loop.io.prompt('Bucket:');
    term.writes.length = 0;

    for (const char of 'my-bucket') term.send(char);
    expect(term.output()).toContain('my-bucket');

    term.send('\r');
    expect(await answer).toBe('my-bucket');
  });

  it('reports Ctrl+C distinctly from an empty answer', async () => {
    const { loop, term } = makeLoop();
    loop.start();

    const answer = loop.io.prompt('Select [1]: ');
    term.send('\x03');

    expect(await answer).toBe(PROMPT_CANCELLED);
  });

  it('does not insert a blank line when output already ended cleanly', async () => {
    const { loop, term } = makeLoop(async (_line, io) => {
      io.write('done\n');
    });

    loop.start();
    term.writes.length = 0;

    term.send('x');
    term.send('\r');
    await vi.waitFor(() => expect(term.output()).toContain('done'));

    expect(term.output()).not.toContain('done\r\n\r\n');
  });
});

describe('TerminalLoop paste handling', () => {
  // xterm delivers a paste as a single onData event with newlines already
  // converted to \r. Regression: a pasted `ls\r` never matched the submit
  // case and sat in the line buffer, corrupting the redraw.

  it('runs each line of a multi-line paste, in order', async () => {
    const ran: string[] = [];
    const { loop, term } = makeLoop(async (line) => {
      ran.push(line);
    });
    loop.start();

    term.send('echo one\recho two\r');

    await vi.waitFor(() => expect(ran).toEqual(['echo one', 'echo two']));
  });

  it('keeps a pasted line without a trailing newline editable', async () => {
    const ran: string[] = [];
    const { loop, term } = makeLoop(async (line) => {
      ran.push(line);
    });
    loop.start();

    term.send('tigris buckets list');
    expect(ran).toEqual([]);

    term.send(' --json');
    term.send('\r');

    await vi.waitFor(() => expect(ran).toEqual(['tigris buckets list --json']));
  });

  it('answers a pending prompt from the rest of the paste', async () => {
    let answer: string | undefined;
    const { loop, term } = makeLoop(async (_line, io) => {
      answer = await (
        io as unknown as { prompt(message: string): Promise<string> }
      ).prompt('Bucket name: ');
    });
    loop.start();

    term.send('tigris buckets create\rmy-bucket\r');

    await vi.waitFor(() => expect(answer).toBe('my-bucket'));
  });

  it('waits for a running command before feeding the next line', async () => {
    const order: string[] = [];
    const { loop, term } = makeLoop(async (line) => {
      order.push(`start ${line}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${line}`);
    });
    loop.start();

    term.send('first\rsecond\r');

    await vi.waitFor(() =>
      expect(order).toEqual([
        'start first',
        'end first',
        'start second',
        'end second',
      ])
    );
  });

  it('still treats an escape sequence as a key, not a paste', async () => {
    const ran: string[] = [];
    const { loop, term } = makeLoop(async (line) => {
      ran.push(line);
    });
    loop.start();

    term.send('echo hi\r');
    await vi.waitFor(() => expect(ran).toEqual(['echo hi']));

    term.send('\x1b[A'); // Up: recall, must not be inserted as text
    term.send('\r');

    await vi.waitFor(() => expect(ran).toEqual(['echo hi', 'echo hi']));
  });
});
