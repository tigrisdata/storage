import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';
import { version as currentVersion } from '../../package.json';
import {
  NPM_REGISTRY_URL,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_NOTIFY_INTERVAL_MS,
} from '../constants.js';

interface UpdateCheckCache {
  latestVersion: string;
  lastChecked: number;
  lastNotified?: number;
}

const CACHE_PATH = join(homedir(), '.tigris', 'update-check.json');

function readUpdateCache(): UpdateCheckCache | null {
  try {
    const data = readFileSync(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    if (
      typeof parsed.latestVersion === 'string' &&
      typeof parsed.lastChecked === 'number'
    ) {
      return parsed as UpdateCheckCache;
    }
    return null;
  } catch {
    return null;
  }
}

function writeUpdateCache(cache: UpdateCheckCache): void {
  try {
    mkdirSync(join(homedir(), '.tigris'), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
  } catch {
    // Silent on failure
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (
    v: string
  ): {
    major: number;
    minor: number;
    patch: number;
    prerelease: string | null;
  } | null => {
    let cleaned = v.startsWith('v') ? v.slice(1) : v;

    // Split off prerelease suffix (e.g., "1.2.3-alpha.1" -> "1.2.3" + "alpha.1")
    let prerelease: string | null = null;
    const dashIndex = cleaned.indexOf('-');
    if (dashIndex !== -1) {
      prerelease = cleaned.slice(dashIndex + 1);
      cleaned = cleaned.slice(0, dashIndex);
    }

    const parts = cleaned.split('.');
    if (parts.length !== 3) return null;

    const nums = parts.map(Number);
    if (nums.some(isNaN)) return null;

    return { major: nums[0], minor: nums[1], patch: nums[2], prerelease };
  };

  const cur = parse(current);
  const lat = parse(latest);
  if (!cur || !lat) return false;

  // Compare major.minor.patch
  if (lat.major > cur.major) return true;
  if (lat.major < cur.major) return false;
  if (lat.minor > cur.minor) return true;
  if (lat.minor < cur.minor) return false;
  if (lat.patch > cur.patch) return true;
  if (lat.patch < cur.patch) return false;

  // Same version number - compare prerelease
  // A stable release (no prerelease) is newer than a prerelease
  if (cur.prerelease && !lat.prerelease) return true;
  // A prerelease is not newer than a stable release
  if (!cur.prerelease && lat.prerelease) return false;
  // Both are prereleases or both are stable with same version
  return false;
}

function fetchLatestVersionInBackground(): void {
  try {
    const req = https.get(NPM_REGISTRY_URL, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (typeof json.version === 'string') {
            const existing = readUpdateCache();
            writeUpdateCache({
              ...existing,
              latestVersion: json.version,
              lastChecked: Date.now(),
            });
          }
        } catch {
          // Silent on parse failure
        }
      });
    });
    req.on('error', () => {
      // Silent on network failure
    });
    req.on('timeout', () => {
      req.destroy();
    });
    req.end();
    // Unref so the request doesn't keep the process alive
    req.on('socket', (socket) => {
      socket.unref();
    });
  } catch {
    // Silent on failure
  }
}

export function checkForUpdates(): void {
  if (process.env.TIGRIS_NO_UPDATE_CHECK === '1') return;
  if (!process.stdout.isTTY) return;

  const cache = readUpdateCache();

  const notifyIntervalMs =
    Number(process.env.TIGRIS_UPDATE_NOTIFY_INTERVAL_MS) ||
    UPDATE_NOTIFY_INTERVAL_MS;

  if (cache && isNewerVersion(currentVersion, cache.latestVersion)) {
    if (
      !cache.lastNotified ||
      Date.now() - cache.lastNotified > notifyIntervalMs
    ) {
      const isBinary =
        (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY === true;
      const isWindows = process.platform === 'win32';
      const line1 = `Update available: ${currentVersion} → ${cache.latestVersion}`;
      let line2: string;
      if (!isBinary) {
        line2 = 'Run `npm install -g @tigrisdata/cli` to upgrade.';
      } else if (isWindows) {
        line2 =
          'Run `irm https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.ps1 | iex`';
      } else {
        line2 =
          'Run `curl -fsSL https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.sh | sh`';
      }
      const width = Math.max(line1.length, line2.length) + 4;
      const top = '┌' + '─'.repeat(width - 2) + '┐';
      const bot = '└' + '─'.repeat(width - 2) + '┘';
      const pad = (s: string) => '│ ' + s.padEnd(width - 4) + ' │';
      console.log(
        `\n${top}\n${pad('')}\n${pad(line1)}\n${pad(line2)}\n${pad('')}\n${bot}\n`
      );
      writeUpdateCache({ ...cache, lastNotified: Date.now() });
    }
  }

  const intervalMs =
    Number(process.env.TIGRIS_UPDATE_CHECK_INTERVAL_MS) ||
    UPDATE_CHECK_INTERVAL_MS;

  if (!cache || Date.now() - cache.lastChecked > intervalMs) {
    fetchLatestVersionInBackground();
  }
}
