/**
 * The entire terminal abstraction.
 *
 * Two methods is enough: `@tigrisdata/agent-shell` drives the same shape from
 * both `node:readline` and xterm.js, so it is proven to be the right seam.
 * Line editing, history and rendering belong to the frontend.
 */
/**
 * Resolved by `prompt` when the user pressed Ctrl+C.
 *
 * Distinct from an empty answer on purpose: empty means "take the default",
 * and treating a cancelled prompt as empty made Ctrl+C on the login picker
 * silently choose the first option.
 */
export const PROMPT_CANCELLED = '\u0000cancelled';

export interface PromptOptions {
  /**
   * Echo a placeholder instead of the typed characters. Set for secrets, so an
   * access-key secret does not end up in terminal scrollback.
   */
  password?: boolean;
}

export interface ReplIO {
  write(text: string): void;
  prompt(message: string, options?: PromptOptions): Promise<string>;
}

/**
 * A `ReplIO` that forwards to another one that does not exist yet.
 *
 * The terminal loop owns the real IO, but the engine needs an IO to construct
 * the loop — so something has to stand in until then. Extracted here rather
 * than written inline at the call site because an inline object literal that
 * silently drops `options` still satisfies this interface: TypeScript accepts
 * a handler taking fewer parameters, so only a test catches it.
 */
export function createDeferredIO(resolve: () => ReplIO | undefined): ReplIO {
  return {
    write: (text) => resolve()?.write(text),
    prompt: (message, options) =>
      resolve()?.prompt(message, options) ?? Promise.resolve(''),
  };
}
