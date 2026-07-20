import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage.js';
import { useSessionStore } from '../auth/session.js';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../auth/api.js', () => ({ logout }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  storage.clear();
  useSessionStore.getState().clearSession();
});

const storage = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear()
  }
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  it('renders the current account as read-only and never exposes a credential field', () => {
    useSessionStore.getState().setSession({
      accessToken: 'session-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });

    renderPage();

    expect(screen.getByRole('heading', { name: /thiết lập cá nhân/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nguyễn An')).toHaveAttribute('readOnly');
    expect(screen.getByDisplayValue('an@example.test')).toHaveAttribute('readOnly');
    expect(screen.queryByRole('button', { name: /lưu/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key|mật khẩu|token/i)).not.toBeInTheDocument();
  });

  it('stores only the motion preference locally', () => {
    useSessionStore.getState().setSession({
      accessToken: 'session-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: /giảm chuyển động/i }));

    expect(window.localStorage.getItem('marxmatrix.preferences')).toBe(
      JSON.stringify({ reduceMotion: true })
    );
  });

  it('clears the local session after logout even if the server is unavailable', async () => {
    logout.mockRejectedValueOnce(new Error('offline'));
    useSessionStore.getState().setSession({
      accessToken: 'session-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /đăng xuất/i }));

    await vi.waitFor(() => expect(useSessionStore.getState().status).toBe('unauthenticated'));
  });

  it('frames settings as a security control surface with an explicit session rail', () => {
    useSessionStore.getState().setSession({
      accessToken: 'session-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyá»…n An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    renderPage();
    expect(screen.getByRole('complementary', { name: /Session security/i })).toBeInTheDocument();
    expect(screen.getByText(/Identity evidence/i)).toBeInTheDocument();
  });

  it('exposes current-session semantics without claiming a server-saved profile', () => {
    useSessionStore.getState().setSession({
      accessToken: 'session-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyá»…n An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    renderPage();
    expect(screen.getByText(/SESSION ACTIVE \/ LOCAL CONTROLS/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Current session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
  });
});
