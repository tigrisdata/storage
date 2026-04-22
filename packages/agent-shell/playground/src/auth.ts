import { createAuth0Client } from "@auth0/auth0-spa-js";
import type { LoginFn, Organization } from "@tigrisdata/agent-shell/repl";

const AUTH0_DOMAIN = "auth.storage.tigrisdata.io";
const AUTH0_CLIENT_ID = "FKXunmhaaBZOYXjNYLIU8Fi2jIqpT7DR";
const AUTH0_AUDIENCE = "https://tigris-os-api";
const CLAIMS_NAMESPACE = "https://tigris";

/**
 * Browser login using Auth0 SPA SDK (Authorization Code + PKCE).
 * Opens a popup for authentication.
 */
export const browserLogin: LoginFn = async (io) => {
	io.write("Logging in to Tigris...\n");

	const auth0 = await createAuth0Client({
		domain: AUTH0_DOMAIN,
		clientId: AUTH0_CLIENT_ID,
		authorizationParams: {
			audience: AUTH0_AUDIENCE,
			scope: "openid profile email offline_access",
			redirect_uri: window.location.origin,
		},
	});

	await auth0.loginWithPopup({
		authorizationParams: {
			audience: AUTH0_AUDIENCE,
			scope: "openid profile email offline_access",
		},
	});

	const accessToken = await auth0.getTokenSilently({
		authorizationParams: {
			audience: AUTH0_AUDIENCE,
		},
	});

	const user = await auth0.getUser();
	const email = user?.email ?? user?.name ?? "unknown";

	io.write(`Logged in as ${email}\n`);

	// Fetch organizations from userinfo
	const userInfoResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	let organizations: Organization[] = [];
	if (userInfoResponse.ok) {
		const data = (await userInfoResponse.json()) as Record<string, unknown>;
		const claims = data[CLAIMS_NAMESPACE] as { ns?: Organization[] } | undefined;
		organizations = claims?.ns ?? [];
	}

	return {
		accessToken,
		email,
		organizations,
	};
};
