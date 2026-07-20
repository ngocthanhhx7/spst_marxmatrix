import type { z } from 'zod';
import { gameEventSchema, gameSnapshotSchema } from '@marxmatrix/contracts';
import type { GameDocument } from './schemas/game.schema.js';
import type { GameEventDocument } from './schemas/game-event.schema.js';

export type GameSnapshotResponse = z.infer<typeof gameSnapshotSchema>;
export type GameEventResponse = z.infer<typeof gameEventSchema>;

export function toGameSnapshotResponse(game: GameDocument): GameSnapshotResponse {
  return gameSnapshotSchema.parse({
    ...game.snapshot,
    id: String(game._id),
    roomId: String(game.roomId),
    config: game.config
  });
}

export function toGameEventResponse(event: GameEventDocument): GameEventResponse {
  return gameEventSchema.parse({
    id: String(event._id),
    gameId: String(event.gameId),
    sequence: event.sequence,
    type: event.type,
    round: event.round,
    playerId: event.playerId === null ? null : String(event.playerId),
    createdAt: event.createdAt.toISOString(),
    payload: event.payload
  });
}
