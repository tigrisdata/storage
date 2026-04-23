import { describe, expect, it } from 'vitest';

import { executeWithConcurrency } from '../../src/utils/concurrency.js';

describe('executeWithConcurrency', () => {
  it('returns empty array for empty tasks', async () => {
    const results = await executeWithConcurrency([], 4);
    expect(results).toEqual([]);
  });

  it('executes a single task', async () => {
    const tasks = [() => Promise.resolve('a')];
    const results = await executeWithConcurrency(tasks, 1);
    expect(results).toEqual(['a']);
  });

  it('preserves result order', async () => {
    const tasks = [
      () => new Promise<number>((r) => setTimeout(() => r(3), 30)),
      () => new Promise<number>((r) => setTimeout(() => r(1), 10)),
      () => new Promise<number>((r) => setTimeout(() => r(2), 20)),
    ];
    const results = await executeWithConcurrency(tasks, 3);
    expect(results).toEqual([3, 1, 2]);
  });

  it('floors concurrency to 1 when 0', async () => {
    const tasks = [() => Promise.resolve('ok')];
    const results = await executeWithConcurrency(tasks, 0);
    expect(results).toEqual(['ok']);
  });

  it('floors concurrency to 1 when negative', async () => {
    const tasks = [() => Promise.resolve('ok')];
    const results = await executeWithConcurrency(tasks, -5);
    expect(results).toEqual(['ok']);
  });

  it('floors fractional concurrency', async () => {
    const tasks = [() => Promise.resolve('a'), () => Promise.resolve('b')];
    const results = await executeWithConcurrency(tasks, 0.5);
    expect(results).toEqual(['a', 'b']);
  });

  it('works when concurrency exceeds number of tasks', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)];
    const results = await executeWithConcurrency(tasks, 100);
    expect(results).toEqual([1, 2]);
  });

  it('limits concurrent execution to the specified concurrency', async () => {
    let running = 0;
    let maxRunning = 0;

    const makeTask = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return true;
    };

    const tasks = Array.from({ length: 8 }, makeTask);
    await executeWithConcurrency(tasks, 3);
    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(maxRunning).toBeGreaterThan(1);
  });

  it('propagates error from a failing task', async () => {
    const tasks = [
      () => Promise.resolve('ok'),
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve('ok'),
    ];
    await expect(executeWithConcurrency(tasks, 2)).rejects.toThrow('boom');
  });
});
