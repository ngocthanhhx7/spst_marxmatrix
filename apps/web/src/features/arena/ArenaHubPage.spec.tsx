import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaHubPage } from './ArenaHubPage.js';

const { create, join } = vi.hoisted(() => ({ create: vi.fn(), join: vi.fn() }));
vi.mock('./arena.api.js', () => ({ arenaApi: { create, join } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/arena']}>
        <Routes>
          <Route path="/arena" element={<ArenaHubPage />} />
          <Route path="/arena/lobby/:code" element={<p>Lobby route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ArenaHubPage', () => {
  it('shows an honest first-use state instead of invented live rooms or replays', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Trung tâm Điều hành Capital Arena' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Chưa có phiên Arena nào để hiển thị/i)).toBeInTheDocument();
    expect(screen.queryByText(/Phiên đang mở/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /phát lại/i })).not.toBeInTheDocument();
  });

  it('creates a room through the API then takes the learner to its lobby', async () => {
    create.mockResolvedValue({ code: 'ARENA1' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng mới' }));
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng riêng' }));

    expect(await screen.findByText('Lobby route')).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({ displayName: 'Lan' });
  });

  it('joins by code through the API then routes to the returned lobby', async () => {
    join.mockResolvedValue({ code: 'ABC123' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Tham gia bằng mã' }));
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Minh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

    expect(await screen.findByText('Lobby route')).toBeInTheDocument();
    expect(join).toHaveBeenCalledWith('ABC123', { displayName: 'Minh' });
  });
});
