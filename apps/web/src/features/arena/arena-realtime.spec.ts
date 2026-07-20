import { beforeEach, describe, expect, it, vi } from 'vitest';

const socket = vi.hoisted(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }));
const io = vi.hoisted(() => vi.fn(() => socket));
vi.mock('socket.io-client', () => ({ io }));
import { arenaRealtime } from './arena-realtime.js';

const gameId = '507f1f77bcf86cd799439011';
const snapshot = {
  id: gameId,
  roomId: '507f1f77bcf86cd799439012',
  stateVersion: 6,
  round: 2,
  phase: 'decision_open',
  deadlineAt: null,
  eventSequence: 8,
  config: {},
  companies: [],
  randomSeed: 'seed',
  decisions: {},
  crisis: null
};
const event = (sequence: number) => ({
  id: `event-${sequence}`,
  gameId,
  sequence,
  type: 'decision_accepted',
  round: 2,
  playerId: null,
  createdAt: '2030-01-01T00:00:00.000Z',
  payload: {}
});

describe('arenaRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('authenticates to the gateway, syncs again after reconnect, ignores snapshot-covered events, and cleans up', () => {
    const handlers = new Map<string, (payload?: never) => void>();
    socket.on.mockImplementation((name: string, handler: (payload?: never) => void) => {
      handlers.set(name, handler);
      return socket;
    });
    const received: number[] = [];
    const stop = arenaRealtime.connect({
      gameId,
      accessToken: 'access-token',
      lastSequence: 3,
      expectedStateVersion: 6,
      onEvent: (next) => received.push(next.sequence)
    });

    expect(io).toHaveBeenCalledWith(
      'http://localhost:3000/arena',
      expect.objectContaining({ auth: { token: 'access-token' }, reconnection: true })
    );
    handlers.get('connect')?.();
    expect(socket.emit).toHaveBeenCalledWith('game:sync', { gameId, expectedStateVersion: 6 });
    handlers.get('game:snapshot')?.(snapshot as never);
    handlers.get('game:event')?.(event(8) as never);
    handlers.get('game:event')?.(event(9) as never);
    expect(received).toEqual([9]);

    handlers.get('connect')?.();
    expect(socket.emit).toHaveBeenCalledTimes(2);
    stop();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('joins the authenticated lobby room and publishes only the server room update', () => {
    const handlers = new Map<string, (payload?: never) => void>();
    socket.on.mockImplementation((name: string, handler: (payload?: never) => void) => {
      handlers.set(name, handler);
      return socket;
    });
    const onRoom = vi.fn();
    const stop = arenaRealtime.connectRoom({
      code: 'abc123',
      accessToken: 'access-token',
      expectedStateVersion: 4,
      onRoom
    });
    handlers.get('connect')?.();
    expect(socket.emit).toHaveBeenCalledWith('room:join', {
      code: 'ABC123',
      expectedStateVersion: 4
    });
    handlers.get('room:updated')?.({ code: 'ABC123', stateVersion: 5 } as never);
    expect(onRoom).toHaveBeenCalledWith({ code: 'ABC123', stateVersion: 5 });
    stop();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});
