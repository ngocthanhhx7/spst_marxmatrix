import type {
  ArenaDecisionCore,
  ArenaReplay,
  GameConfig,
  GameEvent,
  GameSnapshot
} from '@marxmatrix/contracts';
import { apiClient } from '../../shared/api/runtime.js';

export interface ArenaPlayer {
  id: string;
  displayName: string;
  isBot: boolean;
  ready: boolean;
}

export interface ArenaRoom {
  id: string;
  code: string;
  hostId: string;
  playerIds: string[];
  readyPlayerIds: string[];
  players?: ArenaPlayer[];
  phase: 'lobby' | 'started';
  config: Partial<GameConfig>;
  stateVersion: number;
}

export interface StartedArenaGame {
  id: string;
}

type DisplayNameInput = { displayName: string };

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function roomPath(code: string) {
  return `/rooms/${encodeURIComponent(code.trim().toUpperCase())}`;
}

function getArena(identifier: string): Promise<ArenaRoom>;
function getArena(identifier: string, kind: 'game'): Promise<GameSnapshot>;
function getArena(identifier: string, kind?: 'game'): Promise<ArenaRoom | GameSnapshot> {
  return kind === 'game'
    ? apiClient.request<GameSnapshot>(`/games/${encodeURIComponent(identifier)}`)
    : apiClient.request<ArenaRoom>(roomPath(identifier));
}

export const arenaApi = {
  create: (input: DisplayNameInput & { config?: Partial<GameConfig> }) =>
    apiClient.request<ArenaRoom>('/rooms', json(input)),
  get: getArena,
  getGame: (gameId: string) =>
    apiClient.request<GameSnapshot>(`/games/${encodeURIComponent(gameId)}`),
  join: (code: string, input: DisplayNameInput) =>
    apiClient.request<ArenaRoom>(`${roomPath(code)}/join`, json(input)),
  leave: (code: string) =>
    apiClient.request<ArenaRoom | null>(`${roomPath(code)}/leave`, { method: 'POST' }),
  ready: (code: string, expectedStateVersion: number) =>
    apiClient.request<ArenaRoom>(`${roomPath(code)}/ready`, json({ expectedStateVersion })),
  addDemoBot: (code: string) =>
    apiClient.request<ArenaRoom>(`${roomPath(code)}/demo-bot`, { method: 'POST' }),
  start: (code: string, expectedStateVersion: number) =>
    apiClient.request<StartedArenaGame>(`${roomPath(code)}/start`, json({ expectedStateVersion })),
  events: (gameId: string, after = 0) =>
    apiClient.request<GameEvent[]>(
      `/games/${encodeURIComponent(gameId)}/events?after=${encodeURIComponent(String(after))}`
    ),
  replay: (gameId: string) =>
    apiClient.request<ArenaReplay>(`/games/${encodeURIComponent(gameId)}/replay`),
  decision: (gameId: string, input: ArenaDecisionCore & { idempotencyKey?: string }) =>
    apiClient.request<GameSnapshot>(
      `/games/${encodeURIComponent(gameId)}/decisions`,
      json({
        ...input,
        gameId,
        idempotencyKey:
          input.idempotencyKey ??
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(16).slice(2)}`
      })
    )
};
