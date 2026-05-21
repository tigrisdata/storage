import type { Command } from "just-bash";
import type { TigrisConfig } from "../types.js";
import { createForkCommand } from "./fork.js";
import { createPresignCommand } from "./presign.js";
import { createSnapshotCommand } from "./snapshot.js";

/**
 * Create all Tigris custom commands for use with just-bash.
 */
export function createTigrisCommands(config: TigrisConfig): Command[] {
	return [createPresignCommand(config), createSnapshotCommand(config), createForkCommand(config)];
}

export type { ForkOptions } from "./fork.js";
export { createForkCommand } from "./fork.js";
export type { PresignOptions } from "./presign.js";
export { createPresignCommand } from "./presign.js";
export type { SnapshotOptions } from "./snapshot.js";
export { createSnapshotCommand } from "./snapshot.js";
