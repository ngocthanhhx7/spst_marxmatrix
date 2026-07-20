import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../auth/session.js';
import { ArenaLobbyPage } from './ArenaLobbyPage.js';

const { get, ready, leave, addDemoBot, start } = vi.hoisted(() => ({
  get: vi.fn(),
  ready: vi.fn(),
  leave: vi.fn(),
  addDemoBot: vi.fn(),
  start: vi.fn()
}));
vi.mock('./arena.api.js', () => ({ arenaApi: { get, ready, leave, addDemoBot, start } }));
vi.mock('./arena-realtime.js', () => ({
  arenaRealtime: { connectRoom: vi.fn(() => () => undefined) }
}));

const room = {
  id: 'room-1',
  code: 'ABC123',
  hostId: 'host-1',
  players: [
    { id: 'host-1', displayName: 'Lan', isBot: false, ready: true },
    { id: 'bot-1', displayName: 'Người chơi mẫu', isBot: true, ready: true }
  ],
  playerIds: ['host-1', 'bot-1'],
  readyPlayerIds: ['host-1', 'bot-1'],
  phase: 'lobby',
  config: { minPlayers: 1, maxPlayers: 4, maxRounds: 8, decisionDeadlineMs: 60000 },
  stateVersion: 4
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useSessionStore.setState({ status: 'unauthenticated', accessToken: undefined, user: undefined });
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/arena/lobby/ABC123']}>
        <Routes>
          <Route path="/arena/lobby/:code" element={<ArenaLobbyPage />} />
          <Route path="/arena" element={<p>Arena hub</p>} />
          <Route path="/arena/games/:id" element={<p>Game route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ArenaLobbyPage', () => {
  it('renders real player readiness and host-only controls from the room response', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: 'host-1', email: 'x@example.test', role: 'student', displayName: 'Lan' }
    });
    get.mockResolvedValue(room);
    renderPage();

    expect(await screen.findByRole('heading', { name: /PHÒNG #ABC123/i })).toBeInTheDocument();
    expect(screen.getByText('Lan')).toBeInTheDocument();
    expect(screen.getByText('Người chơi mẫu')).toBeInTheDocument();
    expect(screen.getAllByText('Sẵn sàng')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Thêm người chơi mẫu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu phiên' })).toBeInTheDocument();
  });

  it('sends the latest state version for ready and starts the returned game', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: 'host-1', email: 'x@example.test', role: 'student', displayName: 'Lan' }
    });
    get.mockResolvedValue({
      ...room,
      readyPlayerIds: ['bot-1'],
      players: [{ ...room.players[0], ready: false }, room.players[1]]
    });
    ready.mockResolvedValue(room);
    start.mockResolvedValue({ id: 'game-99' });
    renderPage();

    await screen.findByRole('heading', { name: /PHÒNG #ABC123/i });
    fireEvent.click(screen.getByRole('button', { name: 'Sẵn sàng' }));
    expect(await screen.findByText(/Bạn đã sẵn sàng/i)).toBeInTheDocument();
    expect(ready).toHaveBeenCalledWith('ABC123', 4);

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phiên' }));
    expect(await screen.findByText('Game route')).toBeInTheDocument();
    expect(start).toHaveBeenCalledWith('ABC123', 4);
  });
});
