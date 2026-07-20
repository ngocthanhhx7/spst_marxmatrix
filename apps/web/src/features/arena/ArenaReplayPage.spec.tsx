import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaReplayPage } from './ArenaReplayPage.js';

const { replay } = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock('./arena.api.js', () => ({ arenaApi: { replay } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArenaReplayPage', () => {
  it('orders events by sequence and advances one step at a time', async () => {
    replay.mockResolvedValue({
      game: {
        id: '507f1f77bcf86cd799439011',
        round: 2,
        phase: 'game_over',
        stateVersion: 9,
        eventSequence: 3,
        companies: []
      },
      events: [
        {
          id: 'event-2',
          gameId: '507f1f77bcf86cd799439011',
          sequence: 2,
          type: 'round_resolved',
          round: 1,
          playerId: null,
          createdAt: '2030-01-01T00:00:00.000Z',
          payload: {}
        },
        {
          id: 'event-1',
          gameId: '507f1f77bcf86cd799439011',
          sequence: 1,
          type: 'decision_accepted',
          round: 1,
          playerId: null,
          createdAt: '2030-01-01T00:00:00.000Z',
          payload: {}
        }
      ]
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/arena/games/507f1f77bcf86cd799439011/replay']}>
          <Routes>
            <Route path="/arena/games/:id/replay" element={<ArenaReplayPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/01 · decision accepted/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tiếp/i }));
    expect(screen.getByText(/02 · round resolved/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Trước/i }));
    expect(screen.getByText(/01 · decision accepted/i)).toBeInTheDocument();
  });
  it('exposes an accessible timeline control for jumping through evidence', async () => {
    replay.mockResolvedValue({
      game: {
        id: '507f1f77bcf86cd799439011',
        round: 2,
        phase: 'game_over',
        stateVersion: 9,
        eventSequence: 2,
        companies: []
      },
      events: [
        {
          id: 'event-1',
          gameId: '507f1f77bcf86cd799439011',
          sequence: 1,
          type: 'decision_accepted',
          round: 1,
          playerId: null,
          createdAt: '2030-01-01T00:00:00.000Z',
          payload: {}
        },
        {
          id: 'event-2',
          gameId: '507f1f77bcf86cd799439011',
          sequence: 2,
          type: 'round_resolved',
          round: 1,
          playerId: null,
          createdAt: '2030-01-01T00:00:00.000Z',
          payload: {}
        }
      ]
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/arena/games/507f1f77bcf86cd799439011/replay']}>
          <Routes>
            <Route path="/arena/games/:id/replay" element={<ArenaReplayPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByRole('slider', { name: /Replay timeline/i })).toBeInTheDocument();
  });
});
