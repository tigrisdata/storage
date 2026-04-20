import type { TigrisConfig } from "../../src/index.js";

let stored: TigrisConfig | null = null;

export function setCredentials(config: TigrisConfig) {
	stored = config;
}

export function getCredentials(): TigrisConfig | null {
	return stored;
}
