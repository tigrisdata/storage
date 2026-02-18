import { describe, it, expect } from 'vitest';
import { getCommandSpec, getArgumentSpec } from '../../dist/utils/specs.js';

describe('getCommandSpec', () => {
  describe('top-level commands', () => {
    it('should find top-level command', () => {
      const spec = getCommandSpec('buckets');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('buckets');
    });

    it('should find operation within top-level command', () => {
      const spec = getCommandSpec('buckets', 'list');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('list');
      expect(spec?.messages).toBeDefined();
    });

    it('should return null for non-existent command', () => {
      const spec = getCommandSpec('nonexistent');
      expect(spec).toBeNull();
    });

    it('should return null for non-existent operation', () => {
      const spec = getCommandSpec('buckets', 'nonexistent');
      expect(spec).toBeNull();
    });
  });

  describe('nested commands (space-separated path)', () => {
    it('should find nested command via space-separated path', () => {
      const spec = getCommandSpec('iam policies');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('policies');
    });

    it('should find operation within nested command', () => {
      const spec = getCommandSpec('iam policies', 'list');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('list');
      expect(spec?.messages).toBeDefined();
      expect(spec?.messages?.onFailure).toBe('Failed to list policies');
    });

    it('should find all iam policies operations', () => {
      const operations = ['list', 'get', 'create', 'edit', 'delete'];
      for (const op of operations) {
        const spec = getCommandSpec('iam policies', op);
        expect(spec, `${op} should exist`).not.toBeNull();
        expect(spec?.name).toBe(op);
      }
    });

    it('should return null for invalid nested path', () => {
      const spec = getCommandSpec('iam nonexistent');
      expect(spec).toBeNull();
    });

    it('should return null for non-existent operation in nested command', () => {
      const spec = getCommandSpec('iam policies', 'nonexistent');
      expect(spec).toBeNull();
    });
  });

  describe('message resolution', () => {
    it('should resolve messages for top-level command operations', () => {
      const spec = getCommandSpec('buckets', 'create');
      expect(spec?.messages).toBeDefined();
      expect(spec?.messages?.onStart).toBe('Creating bucket...');
    });

    it('should resolve messages for nested command operations', () => {
      const spec = getCommandSpec('iam policies', 'create');
      expect(spec?.messages).toBeDefined();
      expect(spec?.messages?.onStart).toBe('Creating policy...');
      expect(spec?.messages?.onSuccess).toBe("Policy '{{name}}' created");
    });

    it('should resolve messages for nested command delete', () => {
      const spec = getCommandSpec('iam policies', 'delete');
      expect(spec?.messages).toBeDefined();
      expect(spec?.messages?.onSuccess).toBe("Policy '{{resource}}' deleted");
    });
  });
});

describe('getArgumentSpec', () => {
  it('should find argument in top-level command', () => {
    const arg = getArgumentSpec('buckets', 'format', 'list');
    expect(arg).not.toBeNull();
    expect(arg?.name).toBe('format');
  });

  it('should return null for non-existent argument', () => {
    const arg = getArgumentSpec('buckets', 'nonexistent', 'list');
    expect(arg).toBeNull();
  });
});

console.log('Tests completed');
