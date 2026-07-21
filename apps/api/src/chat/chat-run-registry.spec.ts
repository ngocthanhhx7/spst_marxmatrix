import { describe, expect, it } from 'vitest';
import { ChatRunRegistry } from './chat-run-registry.js';

describe('ChatRunRegistry', () => {
  it('cancels only the matching owner run and removes settled controllers', () => {
    const registry = new ChatRunRegistry();
    const controller = registry.register('owner-a', 'run-1');

    expect(registry.cancel('owner-b', 'run-1')).toBe(false);
    expect(registry.cancel('owner-a', 'run-1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);

    registry.release('owner-a', 'run-1');
    expect(registry.cancel('owner-a', 'run-1')).toBe(false);
  });

  it('keeps identical run ids isolated by owner', () => {
    const registry = new ChatRunRegistry();
    const first = registry.register('owner-a', 'shared-run');
    const second = registry.register('owner-b', 'shared-run');

    expect(registry.cancel('owner-a', 'shared-run')).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });
});
