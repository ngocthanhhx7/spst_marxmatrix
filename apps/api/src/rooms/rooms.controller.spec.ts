import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { RoomsController } from './rooms.controller.js';
import { defaultArenaConfig } from '../arena/engine/arena.config.js';

describe('RoomsController response contract', () => {
  it('returns renderable player objects while preserving legacy player id fields', async () => {
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
      stateVersion: 3
    };
    const rooms = { create: vi.fn().mockResolvedValue(room) };
    const controller = new RoomsController(
      rooms as never,
      {} as never,
      { publishRoom: vi.fn() } as never
    );

    const response = await controller.create(
      { id: hostId.toString(), email: 'host@example.test', role: 'student' },
      { displayName: 'Host' }
    );

    expect(response).toMatchObject({
      playerIds: [hostId.toString(), botId.toString()],
      readyPlayerIds: [botId.toString()],
      players: [
        { id: hostId.toString(), displayName: 'Host', isBot: false, ready: false },
        { id: botId.toString(), displayName: 'Demo Bot 1', isBot: true, ready: true }
      ]
    });
  });

  it('broadcasts the authoritative room response after a REST readiness mutation', async () => {
    const hostId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      code: 'ABC123',
      hostId,
      players: [{ userId: hostId, displayName: 'Host', isBot: false }],
      readyPlayerIds: [hostId],
      phase: 'lobby',
      config: defaultArenaConfig,
      stateVersion: 1
    };
    const rooms = { setReady: vi.fn().mockResolvedValue(room) };
    const realtime = { publishRoom: vi.fn() };
    const controller = new RoomsController(rooms as never, {} as never, realtime as never);

    const response = await controller.ready(
      { id: hostId.toString(), email: 'host@example.test', role: 'student' },
      'ABC123',
      { expectedStateVersion: 0 }
    );

    expect(realtime.publishRoom).toHaveBeenCalledWith(response);
    expect(response).toMatchObject({ stateVersion: 1, players: [{ ready: true }] });
  });
});
