import { describe, expect, it, vi } from 'vitest';
import { ArenaRealtimePublisher } from './arena-realtime.publisher.js';

describe('ArenaRealtimePublisher', () => {
  it('broadcasts room updates on the normalized room channel with stateVersion intact', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const publisher = new ArenaRealtimePublisher();
    publisher.bind({ to } as never);
    const room = { code: 'abc123', stateVersion: 7 };

    publisher.publishRoom(room as never);

    expect(to).toHaveBeenCalledWith('arena:room:ABC123');
    expect(emit).toHaveBeenCalledWith('room:updated', room);
  });

  it('broadcasts a versioned snapshot before ordered game events', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const publisher = new ArenaRealtimePublisher();
    publisher.bind({ to } as never);
    const snapshot = { id: '507f1f77bcf86cd799439011', stateVersion: 9 };
    const events = [{ sequence: 3 }, { sequence: 1 }, { sequence: 2 }];

    publisher.publishGame(snapshot as never, events as never);

    expect(to).toHaveBeenCalledWith('arena:game:507f1f77bcf86cd799439011');
    expect(emit.mock.calls).toEqual([
      ['game:snapshot', snapshot],
      ['game:event', { sequence: 1 }],
      ['game:event', { sequence: 2 }],
      ['game:event', { sequence: 3 }]
    ]);
  });

  it('is a no-op before the Socket.IO server is initialized', () => {
    const publisher = new ArenaRealtimePublisher();
    expect(() => publisher.publishRoom({ code: 'ABC123' } as never)).not.toThrow();
  });
});
