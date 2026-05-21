import { describe, expect, it, vi } from "vitest";
import { computeCompletions } from "../src/repl/complete.js";
import { TigrisShell } from "../src/shell.js";
import { TEST_CONFIG, TEST_CONFIG_WITH_BUCKET } from "./helpers.js";

vi.mock("@tigrisdata/storage", () => ({
	get: vi.fn(),
	put: vi.fn(),
	head: vi.fn(),
	list: vi.fn(),
	remove: vi.fn(),
	updateObject: vi.fn(),
	getPresignedUrl: vi.fn(),
	createBucketSnapshot: vi.fn(),
	listBucketSnapshots: vi.fn(),
	createBucket: vi.fn(),
	listBuckets: vi.fn(),
	bundle: vi.fn(),
}));

describe("computeCompletions", () => {
	describe("command completion", () => {
		it("returns full command list for empty line", async () => {
			const [hits, token] = await computeCompletions("", { shell: null, cwd: undefined });
			expect(token).toBe("");
			expect(hits).toContain("login");
			expect(hits).toContain("configure");
			expect(hits).toContain("presign");
			expect(hits).toContain("ls");
			expect(hits).toContain("grep");
		});

		it("filters built-in commands by prefix", async () => {
			const [hits, token] = await computeCompletions("gr", { shell: null, cwd: undefined });
			expect(token).toBe("gr");
			expect(hits).toContain("grep");
			expect(hits.every((h) => h.startsWith("gr"))).toBe(true);
		});

		it("filters REPL commands by prefix", async () => {
			const [hits, token] = await computeCompletions("mou", { shell: null, cwd: undefined });
			expect(token).toBe("mou");
			expect(hits).toEqual(["mount"]);
		});

		it("filters custom commands by prefix", async () => {
			const [hits, token] = await computeCompletions("pres", { shell: null, cwd: undefined });
			expect(token).toBe("pres");
			expect(hits).toEqual(["presign"]);
		});

		it("returns full list when no command matches prefix", async () => {
			const [hits] = await computeCompletions("zzzzzz", { shell: null, cwd: undefined });
			expect(hits.length).toBeGreaterThan(10);
		});
	});

	describe("bucket-name argument completion", () => {
		it("completes bucket names for 'mount'", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/a");
			shell.mount("beta", "/b");

			const [hits, token] = await computeCompletions("mount ", {
				shell,
				cwd: undefined,
			});
			expect(token).toBe("");
			expect(hits.sort()).toEqual(["alpha", "beta"]);
		});

		it("filters bucket names by prefix", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/a");
			shell.mount("beta", "/b");

			const [hits, token] = await computeCompletions("snapshot al", {
				shell,
				cwd: undefined,
			});
			expect(token).toBe("al");
			expect(hits).toEqual(["alpha"]);
		});

		it("completes bucket names for 'fork'", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/a");

			const [forkHits] = await computeCompletions("fork ", { shell, cwd: undefined });
			expect(forkHits).toEqual(["alpha"]);
		});

		it("falls back to path completion for the second arg of mount", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/a");

			const [, token] = await computeCompletions("mount alpha /", {
				shell,
				cwd: undefined,
			});
			expect(token).toBe("/");
		});
	});

	describe("mount-point argument completion", () => {
		it("completes mount points for 'umount'", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/data");
			shell.mount("beta", "/models");

			const [hits, token] = await computeCompletions("umount /m", {
				shell,
				cwd: undefined,
			});
			expect(token).toBe("/m");
			expect(hits).toEqual(["/models"]);
		});

		it("completes mount points for 'flush'", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("alpha", "/data");

			const [hits] = await computeCompletions("flush ", { shell, cwd: undefined });
			expect(hits).toEqual(["/data"]);
		});
	});

	describe("path completion", () => {
		it("lists cwd entries for bare token", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/workspace" });
			await shell.exec("mkdir -p /workspace && touch /workspace/notes.md /workspace/data.json");
			await shell.exec("mkdir /workspace/sub");

			const [hits, token] = await computeCompletions("ls ", {
				shell,
				cwd: "/workspace",
			});
			expect(token).toBe("");
			expect(hits.sort()).toEqual(["data.json", "notes.md", "sub/"]);
		});

		it("filters by file prefix in cwd", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/workspace" });
			await shell.exec("mkdir -p /workspace && touch /workspace/notes.md /workspace/data.json");

			const [hits] = await computeCompletions("cat no", {
				shell,
				cwd: "/workspace",
			});
			expect(hits).toEqual(["notes.md"]);
		});

		it("appends a trailing slash to directories", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/workspace" });
			await shell.exec("mkdir -p /workspace/projects");

			const [hits] = await computeCompletions("cd pro", {
				shell,
				cwd: "/workspace",
			});
			expect(hits).toEqual(["projects/"]);
		});

		it("completes absolute paths", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/" });
			await shell.exec("mkdir -p /etc /home");

			const [hits, token] = await computeCompletions("ls /e", {
				shell,
				cwd: "/",
			});
			expect(token).toBe("/e");
			expect(hits).toEqual(["/etc/"]);
		});

		it("lists the parent directory when token ends with a slash", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/" });
			await shell.exec("mkdir -p /tmp/a /tmp/b");

			const [hits, token] = await computeCompletions("ls /tmp/", {
				shell,
				cwd: "/",
			});
			expect(token).toBe("/tmp/");
			expect(hits.sort()).toEqual(["/tmp/a/", "/tmp/b/"]);
		});

		it("returns empty when the directory does not exist", async () => {
			const shell = new TigrisShell(TEST_CONFIG, { cwd: "/" });

			const [hits] = await computeCompletions("ls /does-not-exist/", {
				shell,
				cwd: "/",
			});
			expect(hits).toEqual([]);
		});

		it("returns empty for path completion when shell is not configured", async () => {
			const [hits] = await computeCompletions("ls foo", { shell: null, cwd: undefined });
			expect(hits).toEqual([]);
		});
	});

	describe("via ReplSession default cwd", () => {
		it("falls back to engine cwd when ctx.cwd is undefined", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			// Auto-mounted at /workspace via TigrisAdapter — we only test that the engine cwd is used,
			// not the contents (which would require mocking the adapter).
			const [, token] = await computeCompletions("ls fo", { shell, cwd: undefined });
			expect(token).toBe("fo");
		});
	});
});
