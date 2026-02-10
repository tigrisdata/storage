import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';
import { version as currentVersion } from '../../package.json';
import { NPM_REGISTRY_URL, UPDATE_CHECK_INTERVAL_MS } from '../constants.js';

interface UpdateCheckCache {
  latestVersion: string;
  lastChecked: number;
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
  const parse = (v: string): number[] | null => {
    const cleaned = v.startsWith('v') ? v.slice(1) : v;
    const parts = cleaned.split('.');
    if (parts.length !== 3) return null;
    const nums = parts.map(Number);
    if (nums.some(isNaN)) return null;
    return nums;
  };

  const cur = parse(current);
  const lat = parse(latest);
  if (!cur || !lat) return false;

  for (let i = 0; i < 3; i++) {
    if (lat[i] > cur[i]) return true;
    if (lat[i] < cur[i]) return false;
  }
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
            writeUpdateCache({
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
    req.unref();
  } catch {
    // Silent on failure
  }
}

export function checkForUpdates(): void {
  if (process.env.TIGRIS_NO_UPDATE_CHECK === '1') return;
  if (!process.stdout.isTTY) return;

  const cache = readUpdateCache();

  if (cache && isNewerVersion(currentVersion, cache.latestVersion)) {
    const line1 = `Update available: ${currentVersion} → ${cache.latestVersion}`;
    const line2 = 'Run `npm install -g @tigrisdata/cli` to upgrade.';
    const width = Math.max(line1.length, line2.length) + 4;
    const top = '┌' + '─'.repeat(width - 2) + '┐';
    const bot = '└' + '─'.repeat(width - 2) + '┘';
    const pad = (s: string) => '│ ' + s.padEnd(width - 4) + ' │';
    console.log(
      `\n${top}\n${pad('')}\n${pad(line1)}\n${pad(line2)}\n${pad('')}\n${bot}\n`
    );
  }

  const intervalMs =
    Number(process.env.TIGRIS_UPDATE_CHECK_INTERVAL_MS) ||
    UPDATE_CHECK_INTERVAL_MS;

  if (!cache || Date.now() - cache.lastChecked > intervalMs) {
    fetchLatestVersionInBackground();
  }
}
