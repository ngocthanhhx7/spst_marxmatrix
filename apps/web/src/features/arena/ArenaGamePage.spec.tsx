import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../auth/session.js';
import { ArenaGamePage } from './ArenaGamePage.js';
import type { ArenaRealtimeOptions } from './arena-realtime.js';

const { getGame, events, decision } = vi.hoisted(() => ({
  getGame: vi.fn(),
  events: vi.fn(),
  decision: vi.fn()
}));
const realtime = vi.hoisted(() => ({
  connect: vi.fn((options: ArenaRealtimeOptions) => {
    void options;
    return () => undefined;
  })
}));
vi.mock('./arena.api.js', () => ({ arenaApi: { getGame, events, decision } }));
vi.mock('./arena-realtime.js', () => ({ arenaRealtime: realtime }));

const snapshot = {
  id: '507f1f77bcf86cd799439011',
  roomId: '507f1f77bcf86cd799439012',
  stateVersion: 6,
  round: 2,
  phase: 'decision_open',
  deadlineAt: '2030-07-20T00:05:00.000Z',
  eventSequence: 3,
  config: {
    maxRounds: 8,
    minimumHiringChange: -20,
    maximumHiringChange: 50,
    minimumPrice: 1,
    maximumPrice: 1000,
    maximumAutomationInvestment: 1000,
    maximumQualityMarketingInvestment: 1000,
    maximumInventoryTarget: 10000
  },
  companies: [
    {
      playerId: '507f1f77bcf86cd799439013',
      name: 'Lan',
      cash: 1250,
      capitalStock: 500,
      workers: 20,
      wageRate: 12,
      automationLevel: 1,
      productivity: 1.2,
      reputation: 0.6,
      marketShare: 0.5,
      price: 20,
      inventory: 8,
      debt: 0,
      constantCapital: 100,
      variableCapital: 240,
      surplusValue: 310,
      bankrupt: false
    }
  ],
  randomSeed: 'seed',
  decisions: {},
  crisis: null
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  useSessionStore.setState({ status: 'unauthenticated', accessToken: undefined, user: undefined });
});

function renderPage() {
  useSessionStore.setState({
    status: 'authenticated',
    accessToken: 'token',
    user: {
      id: '507f1f77bcf86cd799439013',
      email: 'lan@example.test',
      role: 'student',
      displayName: 'Lan'
    }
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/arena/games/507f1f77bcf86cd799439011']}>
        <Routes>
          <Route path="/arena/games/:id" element={<ArenaGamePage />} />
          <Route path="/arena/games/:id/results" element={<p>Results route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ArenaGamePage', () => {
  it('renders an authoritative game snapshot and subscribes from its last event sequence', async () => {
    getGame.mockResolvedValue(snapshot);
    events.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /^Vòng 2$/i })).toBeInTheDocument();
    expect(screen.getByText('Lan')).toBeInTheDocument();
    expect(realtime.connect).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: snapshot.id, accessToken: 'token', lastSequence: 3 })
    );
  });

  it('submits a decision against the snapshot state version', async () => {
    getGame.mockResolvedValue(snapshot);
    events.mockResolvedValue([]);
    decision.mockResolvedValue({
      ...snapshot,
      decisions: { [snapshot.companies[0]!.playerId]: {} }
    });
    renderPage();
    await screen.findByRole('heading', { level: 1, name: /^Vòng 2$/i });
    fireEvent.click(screen.getByRole('button', { name: /Gửi quyết định/i }));
    expect(await screen.findByText(/Đã ghi nhận quyết định/i)).toBeInTheDocument();
    expect(decision).toHaveBeenCalledWith(
      snapshot.id,
      expect.objectContaining({ round: 2, expectedStateVersion: 6 })
    );
  });

  it('reports the realtime connection state honestly', async () => {
    getGame.mockResolvedValue(snapshot);
    events.mockResolvedValue([]);
    realtime.connect.mockImplementationOnce((options) => {
      options.onStatus?.('disconnected');
      return () => undefined;
    });
    renderPage();
    expect(await screen.findByText(/Mất kết nối thời gian thực/i)).toBeInTheDocument();
  });

  it('frames the live session as market evidence with an explicit decision action', async () => {
    getGame.mockResolvedValue(snapshot);
    events.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('heading', { name: /Market pulse/i })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: /Decision console/i })).toBeInTheDocument();
  });

  it('polls the authoritative snapshot while a server deadline is active', async () => {
    vi.useFakeTimers();
    getGame.mockResolvedValue(snapshot);
    events.mockResolvedValue([]);
    renderPage();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getGame).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(getGame.mock.calls.length).toBeGreaterThan(1);
  });
});
