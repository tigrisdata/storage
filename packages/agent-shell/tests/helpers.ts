import type { TigrisConfig } from "../src/types.js";

/** Test config with dummy access key credentials. */
export const TEST_CONFIG: TigrisConfig = {
	accessKeyId: "tid_test",
	secretAccessKey: "tsec_test",
};

/** Test config with bucket for auto-mount. */
export const TEST_CONFIG_WITH_BUCKET: TigrisConfig = {
	bucket: "test",
	accessKeyId: "tid_test",
	secretAccessKey: "tsec_test",
};

/** Test bucket name for adapter tests. */
export const TEST_BUCKET = "test";

/** Mock data helpers for tests. */

export function mockListResponse(
	items: Array<{ name: string; size?: number }> = [],
	commonPrefixes: string[] = [],
) {
	return {
		data: {
			items: items.map((item, i) => ({
				id: String(i),
				name: item.name,
				size: item.size ?? 0,
				lastModified: new Date(),
			})),
			commonPrefixes,
			hasMore: false,
			paginationToken: undefined,
		},
	};
}

export function mockHeadResponse(overrides?: { modified?: Date; size?: number }) {
	return {
		data: {
			modified: overrides?.modified ?? new Date(),
			size: overrides?.size ?? 0,
			contentDisposition: "",
			contentType: "",
			path: "",
			url: "",
		},
	};
}

export function mockPutResponse() {
	return {
		data: {
			contentDisposition: "",
			contentType: "",
			modified: new Date(),
			path: "",
			size: 0,
			url: "",
		},
	};
}

// biome-ignore lint/suspicious/noExplicitAny: SDK overload requires cast for mock
export function mockGetResponse(content: string): any {
	return { data: content };
}

export function mockUpdateObjectResponse() {
	return {
		data: {
			path: "",
		},
	};
}
