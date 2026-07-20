import { describe, expect, it, vi } from 'vitest';
import { roomSchema } from '@marxmatrix/contracts';
import { Types } from 'mongoose';
import { RoomSchema } from './schemas/room.schema.js';
import { createRoomInputSchema } from './room-input.js';
import { RoomsService } from './rooms.service.js';
import { defaultArenaConfig } from '../arena/engine/arena.config.js';

describe('Room persistence contract', () => {
  it('enforces a unique code and expires only inactive lobbies', () => {
    const indexes = RoomSchema.indexes();
    expect(indexes).toContainEqual([{ code: 1 }, { unique: true }]);
    expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
    const expiresAt = RoomSchema.path('expiresAt');
    expect(expiresAt.options['required']).not.toBe(true);
    expect(expiresAt.options['default']).toBeNull();
  });

  it('accepts versioned started rooms at the shared boundary', () => {
    const value = roomSchema.parse({
      id: new Types.ObjectId().toString(),
      code: 'ABC123',
      hostId: new Types.ObjectId().toString(),
      playerIds: [],
      readyPlayerIds: [],
      players: [],
      phase: 'started',
      stateVersion: 4,
      config: {
        maxRounds: 8,
        minPlayers: 1,
        maxPlayers: 4,
        startingCash: 1000,
        startingWorkers: 20,
        startingWageRate: 10,
        decisionDeadlineMs: 25000
      }
    });
    expect(value).toMatchObject({ phase: 'started', stateVersion: 4 });
  });

  it('rejects unknown game configuration keys at the request boundary', () => {
    expect(() =>
      createRoomInputSchema.parse({
        displayName: 'Host',
        config: { maxPlayers: 4, mysteryCoefficient: 1 }
      })
    ).toThrow();
    expect(
      createRoomInputSchema.parse({ displayName: 'Host', config: { minPlayers: 1, maxPlayers: 4 } })
        .config
    ).toMatchObject({ minPlayers: 1, maxPlayers: 4 });
  });

  it('clears lobby expiry atomically when the host starts', async () => {
    const hostId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [{ userId: hostId, displayName: 'Host', isBot: false }],
      readyPlayerIds: [hostId],
      phase: 'lobby',
      stateVersion: 2,
      config: { ...defaultArenaConfig, minPlayers: 1 }
    };
    const findOneAndUpdate = vi.fn().mockReturnValue({
      exec: () => Promise.resolve({ ...room, phase: 'started', stateVersion: 3, expiresAt: null })
    });
    const service = new RoomsService({
      findOne: vi.fn().mockReturnValue({ exec: () => Promise.resolve(room) }),
      findOneAndUpdate
    } as never);
    await service.start(room.code, hostId.toString(), 2);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: { phase: 'started', expiresAt: null } }),
      { returnDocument: 'after' }
    );
  });

  it('returns an already-started room so game creation can be repaired on retry', async () => {
    const hostId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [{ userId: hostId, displayName: 'Host', isBot: false }],
      readyPlayerIds: [hostId],
      phase: 'started',
      stateVersion: 3,
      config: { ...defaultArenaConfig, minPlayers: 1 },
      expiresAt: null
    };
    const findOneAndUpdate = vi.fn();
    const service = new RoomsService({
      findOne: vi.fn().mockReturnValue({ exec: () => Promise.resolve(room) }),
      findOneAndUpdate
    } as never);
    await expect(service.start(room.code, hostId.toString(), 2)).resolves.toBe(room);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reports a concurrent start when a host leave loses its guarded delete', async () => {
    const hostId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [{ userId: hostId, displayName: 'Host', isBot: false }],
      readyPlayerIds: [],
      phase: 'lobby',
      stateVersion: 0,
      config: defaultArenaConfig
    };
    const service = new RoomsService({
      findOne: vi.fn().mockReturnValue({ exec: () => Promise.resolve(room) }),
      deleteOne: vi
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve({ acknowledged: true, deletedCount: 0 }) }),
      findById: vi.fn().mockReturnValue({
        exec: () => Promise.resolve({ ...room, phase: 'started', expiresAt: null })
      })
    } as never);
    await expect(service.leave(room.code, hostId.toString())).rejects.toMatchObject({
      code: 'ROOM_ALREADY_STARTED'
    });
  });

  it('reports a concurrent start when a player leave loses its guarded update', async () => {
    const hostId = new Types.ObjectId();
    const playerId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [
        { userId: hostId, displayName: 'Host', isBot: false },
        { userId: playerId, displayName: 'Player', isBot: false }
      ],
      readyPlayerIds: [],
      phase: 'lobby',
      stateVersion: 1,
      config: defaultArenaConfig
    };
    const service = new RoomsService({
      findOne: vi.fn().mockReturnValue({ exec: () => Promise.resolve(room) }),
      findOneAndUpdate: vi.fn().mockReturnValue({ exec: () => Promise.resolve(null) }),
      findById: vi.fn().mockReturnValue({
        exec: () => Promise.resolve({ ...room, phase: 'started', expiresAt: null })
      })
    } as never);
    await expect(service.leave(room.code, playerId.toString())).rejects.toMatchObject({
      code: 'ROOM_ALREADY_STARTED'
    });
  });
});
