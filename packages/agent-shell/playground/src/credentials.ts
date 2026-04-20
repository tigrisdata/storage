import type { TigrisConfig } from "@tigrisdata/agent-shell";

let stored: TigrisConfig | null = null;

export function setCredentials(config: TigrisConfig) {
	stored = config;
}

export function getCredentials(): TigrisConfig | null {
	return stored;
}
