import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaResultsPage } from './ArenaResultsPage.js';

const { getGame } = vi.hoisted(() => ({ getGame: vi.fn() }));
vi.mock('./arena.api.js', () => ({ arenaApi: { getGame } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/arena/games/507f1f77bcf86cd799439011/results']}>
        <Routes>
          <Route path="/arena/games/:id/results" element={<ArenaResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ArenaResultsPage', () => {
  it('shows final rankings only from a game-over snapshot', async () => {
    getGame.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      stateVersion: 9,
      round: 8,
      phase: 'game_over',
      eventSequence: 7,
      companies: [
        {
          playerId: 'a',
          name: 'Atlas',
          cash: 400,
          surplusValue: 120,
          marketShare: 0.4,
          workers: 10,
          bankrupt: false
        },
        {
          playerId: 'b',
          name: 'Boreal',
          cash: 100,
          surplusValue: 40,
          marketShare: 0.2,
          workers: 4,
          bankrupt: true
        }
      ]
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: /Kết quả phiên/i })).toBeInTheDocument();
    expect(screen.getAllByText('Atlas')).not.toHaveLength(0);
    expect(screen.getByText(/Đã phá sản/i)).toBeInTheDocument();
  });

  it('does not present an in-progress snapshot as a final ranking', async () => {
    getGame.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      stateVersion: 6,
      round: 2,
      phase: 'decision_open',
      eventSequence: 3,
      companies: [
        {
          playerId: 'a',
          name: 'Atlas',
          cash: 400,
          surplusValue: 120,
          marketShare: 0.4,
          workers: 10,
          bankrupt: false
        }
      ]
    });
    renderPage();
    expect(await screen.findByText(/Phiên chưa kết thúc/i)).toBeInTheDocument();
    expect(screen.queryByText('Atlas')).not.toBeInTheDocument();
  });
  it('adds a podium and evidence-led learning debrief to the final snapshot', async () => {
    getGame.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      stateVersion: 9,
      round: 8,
      phase: 'game_over',
      eventSequence: 7,
      companies: [
        {
          playerId: 'a',
          name: 'Atlas',
          cash: 400,
          surplusValue: 120,
          marketShare: 0.4,
          workers: 10,
          bankrupt: false
        },
        {
          playerId: 'b',
          name: 'Boreal',
          cash: 100,
          surplusValue: 40,
          marketShare: 0.2,
          workers: 4,
          bankrupt: true
        }
      ]
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: /Podium/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Learning debrief/i })).toBeInTheDocument();
  });
});
