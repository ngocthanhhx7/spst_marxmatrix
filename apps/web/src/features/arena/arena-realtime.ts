import {
  type ApiError,
  type ClientToServerEvents,
  type GameEvent,
  type GameSnapshot,
  type ServerToClientEvents
} from '@marxmatrix/contracts';
import { io, type Socket } from 'socket.io-client';
import type { ArenaRoom } from './arena.api.js';

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface ArenaRealtimeOptions {
  gameId: string;
  accessToken: string;
  lastSequence: number;
  expectedStateVersion?: number;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onEvent?: (event: GameEvent) => void;
  onError?: (error: ApiError) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

export interface ArenaRoomRealtimeOptions {
  code: string;
  accessToken: string;
  expectedStateVersion: number;
  onRoom?: (room: ArenaRoom) => void;
  onError?: (error: ApiError) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

function socketOrigin(): string {
  const environment = import.meta.env as unknown;
  const rawConfigured =
    typeof environment === 'object' && environment !== null
      ? (environment as Record<string, unknown>)['VITE_API_BASE_URL']
      : undefined;
  const configured =
    typeof rawConfigured === 'string' ? rawConfigured : 'http://localhost:3000/api/v1';
  return configured.replace(/\/api\/v1\/?$/, '');
}

export const arenaRealtime = {
  connect(options: ArenaRealtimeOptions): () => void {
    options.onStatus?.('connecting');
    let lastSequence = options.lastSequence;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      `${socketOrigin()}/arena`,
      {
        auth: { token: options.accessToken },
        reconnection: true
      }
    );

    socket.on('connect', () => {
      options.onStatus?.('connected');
      socket.emit('game:sync', {
        gameId: options.gameId,
        expectedStateVersion: options.expectedStateVersion ?? 0
      });
    });
    socket.on('disconnect', () => options.onStatus?.('disconnected'));
    socket.on('connect_error', () => options.onStatus?.('disconnected'));
    socket.on('server:error', (error) => options.onError?.(error));
    socket.on('game:snapshot', (snapshot) => {
      // The gateway emits a current snapshot before its replayed event log.
      // Treat that snapshot as the sync watermark so already-represented events
      // do not get applied a second time after a reconnect.
      lastSequence = Math.max(lastSequence, snapshot.eventSequence);
      options.onSnapshot?.(snapshot);
    });
    socket.on('game:event', (event) => {
      if (event.sequence <= lastSequence) return;
      lastSequence = event.sequence;
      options.onEvent?.(event);
    });

    return () => socket.disconnect();
  },
  connectRoom(options: ArenaRoomRealtimeOptions): () => void {
    options.onStatus?.('connecting');
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      `${socketOrigin()}/arena`,
      { auth: { token: options.accessToken }, reconnection: true }
    );
    socket.on('connect', () => {
      options.onStatus?.('connected');
      socket.emit('room:join', {
        code: options.code.trim().toUpperCase(),
        expectedStateVersion: options.expectedStateVersion
      });
    });
    socket.on('disconnect', () => options.onStatus?.('disconnected'));
    socket.on('connect_error', () => options.onStatus?.('disconnected'));
    socket.on('server:error', (error) => options.onError?.(error));
    socket.on('room:updated', (room) => options.onRoom?.(room));
    return () => socket.disconnect();
  }
};
