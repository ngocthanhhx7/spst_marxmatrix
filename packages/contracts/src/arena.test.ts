import { describe, expect, it } from 'vitest';
import { roomSchema } from './arena.js';

describe('Arena room contract', () => {
  it('keeps renderable player details and readiness at the shared boundary', () => {
    const hostId = '507f1f77bcf86cd799439011';
    const botId = '507f191e810c19729de860ea';

    const room = roomSchema.parse({
      id: '507f1f77bcf86cd799439012',
      code: 'ABC123',
      hostId,
      playerIds: [hostId, botId],
      readyPlayerIds: [botId],
      players: [
        { id: hostId, displayName: 'Host', isBot: false, ready: false },
        { id: botId, displayName: 'Demo Bot 1', isBot: true, ready: true }
      ],
      phase: 'lobby',
      stateVersion: 3,
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

    expect(room.players).toEqual([
      { id: hostId, displayName: 'Host', isBot: false, ready: false },
      { id: botId, displayName: 'Demo Bot 1', isBot: true, ready: true }
    ]);
  });
});
