import { describe, it, expect } from 'vitest';
import { executeWithConcurrency } from './utils';

describe('executeWithConcurrency', () => {
  it('should execute all tasks and return results in order', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];

    const results = await executeWithConcurrency(tasks, 2);

    expect(results).toEqual([1, 2, 3]);
  });

  it('should return empty array for empty tasks', async () => {
    const results = await executeWithConcurrency([], 4);

    expect(results).toEqual([]);
  });

  it('should respect concurrency limit', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const createTask = (value: number) => async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
      return value;
    };

    const tasks = [1, 2, 3, 4, 5, 6].map(createTask);

    const results = await executeWithConcurrency(tasks, 2);

    expect(results).toEqual([1, 2, 3, 4, 5, 6]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should handle concurrency greater than task count', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.resolve('b'),
    ];

    const results = await executeWithConcurrency(tasks, 10);

    expect(results).toEqual(['a', 'b']);
  });

  it('should default to 1 when concurrency is 0', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const createTask = (value: number) => async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeCount--;
      return value;
    };

    const tasks = [1, 2, 3].map(createTask);

    const results = await executeWithConcurrency(tasks, 0);

    expect(results).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1);
  });

  it('should default to 1 when concurrency is negative', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const createTask = (value: number) => async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeCount--;
      return value;
    };

    const tasks = [1, 2, 3].map(createTask);

    const results = await executeWithConcurrency(tasks, -5);

    expect(results).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1);
  });

  it('should floor decimal concurrency values', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const createTask = (value: number) => async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
      return value;
    };

    const tasks = [1, 2, 3, 4, 5].map(createTask);

    const results = await executeWithConcurrency(tasks, 2.9);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should propagate task errors', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('Task failed')),
      () => Promise.resolve(3),
    ];

    await expect(executeWithConcurrency(tasks, 1)).rejects.toThrow('Task failed');
  });

  it('should execute tasks sequentially when concurrency is 1', async () => {
    const executionOrder: number[] = [];

    const createTask = (value: number) => async () => {
      executionOrder.push(value);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return value;
    };

    const tasks = [1, 2, 3].map(createTask);

    await executeWithConcurrency(tasks, 1);

    expect(executionOrder).toEqual([1, 2, 3]);
  });
});
