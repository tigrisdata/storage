import type { LoginResult, Organization } from "../repl/auth.js";
import type { ReplIO } from "../repl/io.js";

const AUTH0_DOMAIN = "https://auth.storage.tigrisdata.io";
const AUTH0_CLIENT_ID = "FKXunmhaaBZOYXjNYLIU8Fi2jIqpT7DR";
const AUTH0_AUDIENCE = "https://tigris-os-api";
const AUTH0_SCOPES = "openid profile email offline_access";
const CLAIMS_NAMESPACE = "https://tigris";
const DEFAULT_POLL_INTERVAL = 5;

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
}

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
	expires_in: number;
	token_type: string;
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
	const response = await fetch(`${AUTH0_DOMAIN}/oauth/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: AUTH0_CLIENT_ID,
			audience: AUTH0_AUDIENCE,
			scope: AUTH0_SCOPES,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Device code request failed: ${text}`);
	}

	return response.json() as Promise<DeviceCodeResponse>;
}

async function pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
	let pollInterval = Math.max(interval, DEFAULT_POLL_INTERVAL) * 1000;

	for (;;) {
		await new Promise((resolve) => setTimeout(resolve, pollInterval));

		const response = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: AUTH0_CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});

		const data = (await response.json()) as TokenResponse & { error?: string };

		if (data.error === "authorization_pending") {
			continue;
		}
		if (data.error === "slow_down") {
			pollInterval += 5000; // RFC 8628 §3.5: permanently increase by 5s
			continue;
		}
		if (data.error) {
			throw new Error(`Authorization failed: ${data.error}`);
		}

		return data;
	}
}

function extractEmail(idToken: string): string {
	const parts = idToken.split(".");
	if (parts.length !== 3 || !parts[1]) {
		return "unknown";
	}

	try {
		const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const payload = JSON.parse(atob(base64));
		return payload.email ?? payload.name ?? "unknown";
	} catch {
		return "unknown";
	}
}

async function fetchOrganizations(accessToken: string): Promise<Organization[]> {
	const response = await fetch(`${AUTH0_DOMAIN}/userinfo`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		return [];
	}

	const data = (await response.json()) as Record<string, unknown>;
	const claims = data[CLAIMS_NAMESPACE] as { ns?: Organization[] } | undefined;

	return claims?.ns ?? [];
}

/**
 * OAuth Device Flow login for CLI (Node.js).
 */
export async function deviceLogin(io: ReplIO): Promise<LoginResult> {
	io.write("Logging in to Tigris...\n");

	const deviceCode = await requestDeviceCode();

	io.write("\nOpen this URL in your browser:\n");
	io.write(`  ${deviceCode.verification_uri_complete}\n\n`);
	io.write(`Or go to ${deviceCode.verification_uri} and enter code: ${deviceCode.user_code}\n\n`);
	io.write("Waiting for authorization...");

	const tokens = await pollForToken(deviceCode.device_code, deviceCode.interval);

	io.write(" done!\n\n");

	const email = tokens.id_token ? extractEmail(tokens.id_token) : "unknown";
	io.write(`Logged in as ${email}\n`);

	const organizations = await fetchOrganizations(tokens.access_token);

	return {
		accessToken: tokens.access_token,
		...(tokens.refresh_token !== undefined && { refreshToken: tokens.refresh_token }),
		email,
		organizations,
	};
}
