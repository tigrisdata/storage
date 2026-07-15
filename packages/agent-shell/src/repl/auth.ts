import type { ReplIO } from "./io.js";

export interface Organization {
	id: string;
	name: string;
}

export interface LoginResult {
	accessToken: string;
	refreshToken?: string;
	email: string;
	organizations: Organization[];
}

/** Login function signature — device flow (CLI) or Auth0 SDK (browser). */
export type LoginFn = (io: ReplIO) => Promise<LoginResult>;
