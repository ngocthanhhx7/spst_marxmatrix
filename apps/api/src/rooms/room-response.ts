import type { z } from 'zod';
import { roomSchema } from '@marxmatrix/contracts';
import type { RoomDocument } from './schemas/room.schema.js';

export type RoomResponse = z.infer<typeof roomSchema>;

export function toRoomResponse(room: RoomDocument): RoomResponse {
  const readyPlayerIds = room.readyPlayerIds.map(String);
  const ready = new Set(readyPlayerIds);
  return roomSchema.parse({
    id: String(room._id),
    code: room.code,
    hostId: String(room.hostId),
    playerIds: room.players.map((player) => String(player.userId)),
    readyPlayerIds,
    players: room.players.map((player) => ({
      id: String(player.userId),
      displayName: player.displayName,
      isBot: player.isBot,
      ready: ready.has(String(player.userId))
    })),
    phase: room.phase,
    config: room.config,
    stateVersion: room.stateVersion
  });
}
