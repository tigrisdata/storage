import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { version as currentVersion } from '../../package.json';
import {
  INSTALL_BASE_URL,
  NPM_REGISTRY_URL,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_NOTIFY_INTERVAL_MS,
} from '../constants.js';
import { getInstallMethod } from './install-method.js';

interface UpdateCheckCache {
  latestVersion: string;
  lastChecked: number;
  lastNotified?: number;
}

const CACHE_PATH = join(homedir(), '.tigris', 'update-check.json');

export function readUpdateCache(): UpdateCheckCache | null {
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
    if (nums.some(Number.isNaN)) return null;

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

/**
 * Returns the platform-appropriate shell command for updating the CLI.
 */
export function getUpdateCommand(): string {
  switch (getInstallMethod()) {
    case 'npm':
      return 'npm install -g @tigrisdata/cli';
    case 'homebrew':
      return 'brew upgrade tigris';
    default:
      // Standalone binary installed via the curl/irm script.
      return process.platform === 'win32'
        ? `irm ${INSTALL_BASE_URL}/install.ps1 | iex`
        : `curl -fsSL ${INSTALL_BASE_URL}/install.sh | sh`;
  }
}

/**
 * Fetch the latest published version string from the npm registry.
 * When `unref` is true the underlying socket is unref'd so it won't
 * keep the process alive (used by the background check).
 */
export function fetchLatestVersion(
  options: { unref?: boolean } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(NPM_REGISTRY_URL, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (typeof json.version === 'string') {
            writeUpdateCache({
              ...readUpdateCache(),
              latestVersion: json.version,
              lastChecked: Date.now(),
            });
            resolve(json.version);
          } else {
            reject(new Error('Unexpected registry response'));
          }
        } catch {
          reject(new Error('Failed to parse registry response'));
        }
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    if (options.unref) {
      req.on('socket', (socket) => {
        socket.unref();
      });
    }
    req.end();
  });
}

function fetchLatestVersionInBackground(): void {
  fetchLatestVersion({ unref: true }).catch(() => {
    // Silent on failure
  });
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
      const line1 = `Update available: ${currentVersion} → ${cache.latestVersion}`;
      const line2 = 'Run "tigris update" to upgrade.';
      const width = Math.max(line1.length, line2.length) + 4;
      const top = `┌${'─'.repeat(width - 2)}┐`;
      const bot = `└${'─'.repeat(width - 2)}┘`;
      const pad = (s: string) => `│ ${s.padEnd(width - 4)} │`;
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
