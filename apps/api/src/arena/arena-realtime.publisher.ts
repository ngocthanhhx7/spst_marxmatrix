import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { GameEventResponse, GameSnapshotResponse } from '../games/game-response.js';
import type { RoomResponse } from '../rooms/room-response.js';

@Injectable()
export class ArenaRealtimePublisher {
  private server?: Pick<Server, 'to'>;

  bind(server: Pick<Server, 'to'>): void {
    this.server = server;
  }

  publishRoom(room: RoomResponse): void {
    this.server?.to(`arena:room:${room.code.toUpperCase()}`).emit('room:updated', room);
  }

  publishGame(snapshot: GameSnapshotResponse, events: readonly GameEventResponse[] = []): void {
    const channel = this.server?.to(`arena:game:${snapshot.id}`);
    if (channel === undefined) return;
    channel.emit('game:snapshot', snapshot);
    for (const event of [...events].sort((left, right) => left.sequence - right.sequence))
      channel.emit('game:event', event);
  }
}
