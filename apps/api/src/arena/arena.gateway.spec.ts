import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { defaultArenaConfig } from './engine/arena.config.js';
import { ArenaGateway } from './arena.gateway.js';

const user = {
  id: new Types.ObjectId().toString(),
  email: 'player@example.test',
  role: 'student' as const
};

const socket = (token?: string) => ({
  handshake: { auth: token === undefined ? {} : { token }, headers: {} },
  data: {} as Record<string, unknown>,
  emit: vi.fn(),
  join: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn()
});

const createGateway = (overrides?: {
  verify?: ReturnType<typeof vi.fn>;
  rooms?: Record<string, unknown>;
  games?: Record<string, unknown>;
}) =>
  new ArenaGateway(
    { verifyAsync: overrides?.verify ?? vi.fn().mockResolvedValue(user) } as never,
    { getOrThrow: vi.fn().mockReturnValue('test-access-secret') } as never,
    (overrides?.rooms ?? {}) as never,
    (overrides?.games ?? {}) as never
  );

describe('ArenaGateway', () => {
  it('rejects a connection without an access token', async () => {
    const client = socket();

    await createGateway().handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'server:error',
      expect.objectContaining({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED' })
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('uses the access-token verifier and stores the authenticated user on the socket', async () => {
    const verify = vi.fn().mockResolvedValue(user);
    const client = socket('access-token');

    await createGateway({ verify }).handleConnection(client);

    expect(verify).toHaveBeenCalledWith('access-token', { secret: 'test-access-secret' });
    expect(client.data['user']).toEqual(user);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects room subscription when the authenticated player is not a member', async () => {
    const client = socket('access-token');
    client.data['user'] = user;
    const gateway = createGateway({
      rooms: {
        getForPlayer: vi
          .fn()
          .mockRejectedValue(new DomainError('ROOM_NOT_FOUND', 'Room was not found.', 404))
      }
    });

    await gateway.handleRoomSubscription(client, { code: 'ABC123', expectedStateVersion: 0 });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'server:error',
      expect.objectContaining({ statusCode: 404, code: 'ROOM_NOT_FOUND' })
    );
  });

  it('subscribes a member and emits a versioned renderable room payload', async () => {
    const hostId = new Types.ObjectId();
    const botId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [
        { userId: hostId, displayName: 'Host', isBot: false },
        { userId: botId, displayName: 'Demo Bot 1', isBot: true }
      ],
      readyPlayerIds: [botId],
      phase: 'lobby',
      config: defaultArenaConfig,
      stateVersion: 4
    };
    const client = socket('access-token');
    client.data['user'] = { ...user, id: hostId.toString() };
    const gateway = createGateway({
      rooms: { getForPlayer: vi.fn().mockResolvedValue(room) }
    });

    await gateway.handleRoomSubscription(client, { code: 'abc123', expectedStateVersion: 1 });

    expect(client.join).toHaveBeenCalledWith('arena:room:ABC123');
    expect(client.emit).toHaveBeenCalledWith(
      'room:updated',
      expect.objectContaining({
        code: 'ABC123',
        stateVersion: 4,
        players: [
          { id: hostId.toString(), displayName: 'Host', isBot: false, ready: false },
          { id: botId.toString(), displayName: 'Demo Bot 1', isBot: true, ready: true }
        ]
      })
    );
  });

  it('subscribes a game member and emits snapshot then events in sequence order', async () => {
    const gameId = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const game = {
      _id: gameId,
      roomId,
      config: defaultArenaConfig,
      snapshot: {
        id: gameId.toString(),
        stateVersion: 8,
        round: 2,
        phase: 'decision_open',
        deadlineAt: new Date(Date.now() + 10_000).toISOString(),
        companies: [],
        randomSeed: 'seed',
        decisions: {},
        crisis: null,
        eventSequence: 2
      }
    };
    const events = [2, 1].map((sequence) => ({
      _id: new Types.ObjectId(),
      gameId,
      sequence,
      type: `event_${sequence}`,
      round: 2,
      playerId: null,
      createdAt: new Date(`2026-07-20T00:00:0${sequence}.000Z`),
      payload: { sequence }
    }));
    const client = socket('access-token');
    client.data['user'] = user;
    const gateway = createGateway({
      games: {
        get: vi.fn().mockResolvedValue(game),
        eventsFor: vi.fn().mockResolvedValue(events)
      }
    });

    await gateway.handleGameSubscription(client, {
      gameId: gameId.toString(),
      expectedStateVersion: 3
    });

    expect(client.join).toHaveBeenCalledWith(`arena:game:${gameId.toString()}`);
    expect(client.emit).toHaveBeenCalledWith(
      'game:snapshot',
      expect.objectContaining({ id: gameId.toString(), stateVersion: 8, eventSequence: 2 })
    );
    const emitted = client.emit.mock.calls as Array<[string, { sequence?: number }]>;
    expect(
      emitted.filter(([event]) => event === 'game:event').map(([, payload]) => payload.sequence)
    ).toEqual([1, 2]);
  });
});
