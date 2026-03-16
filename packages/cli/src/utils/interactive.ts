import * as readline from 'readline';

/**
 * Guard for interactive-only operations.
 * Fails fast with a helpful hint when stdin is not a TTY
 * (e.g., when called from a script or AI agent).
 */
export function requireInteractive(hint: string): void {
  if (process.stdin.isTTY) return;
  console.error(
    'Error: this command requires interactive input (not available in piped/scripted mode)'
  );
  console.error(`Hint: ${hint}`);
  process.exit(1);
}

/**
 * Prompt the user for y/N confirmation via readline.
 * Returns true only if the user types "y" (case-insensitive).
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
