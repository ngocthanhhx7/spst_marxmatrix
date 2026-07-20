import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from './AdminRoute.js';
import { LoginPage } from './LoginPage.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { RegisterPage } from './RegisterPage.js';
import { useSessionStore } from './session.js';

const { login, registerAccount } = vi.hoisted(() => ({ login: vi.fn(), registerAccount: vi.fn() }));
vi.mock('./api.js', () => ({ login, register: registerAccount, logout: vi.fn() }));

const studentSession = {
  accessToken: 'access',
  user: {
    id: '507f1f77bcf86cd799439011',
    email: 'student@example.test',
    displayName: 'Student',
    role: 'student' as const
  }
};

afterEach(() => {
  cleanup();
  login.mockReset();
  registerAccount.mockReset();
  useSessionStore.getState().clearSession();
});

function protectedScannerRoutes() {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/scanner/new" element={<p>Scanner creation</p>} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<p>Dashboard</p>} />
    </Routes>
  );
}

describe('auth pages', () => {
  it('rejects a student at AdminRoute', () => {
    useSessionStore.getState().setSession(studentSession);
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<p>Admin content</p>} />
          </Route>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows validation errors with accessible field semantics', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('presents sign in as a workspace-resumption screen', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText('BẢN TUYÊN NGÔN BẰNG CHỨNG')).toBeInTheDocument();
    expect(screen.getByText('WORKSPACE SESSION ENCRYPTED')).toBeInTheDocument();
    expect(screen.getByLabelText('Ghi nhớ phiên đăng nhập')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'MarxMatrix' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Tư liệu' })).toHaveAttribute('href', '/#method');
    expect(screen.getByText('02 / EVIDENCE PROTOCOL')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'BẢN TUYÊN NGÔN BẰNG CHỨNG' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tiếp tục điều tra' })).toBeInTheDocument();
  });

  it('marks the sign-in form busy while the request is pending', async () => {
    let resolveLogin: ((value: typeof studentSession) => void) | undefined;
    login.mockImplementationOnce(
      () =>
        new Promise<typeof studentSession>((resolve) => {
          resolveLogin = resolve;
        })
    );
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('form', { name: 'Đăng nhập' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Đang đăng nhập…' })).toBeDisabled();
    resolveLogin?.(studentSession);
  });

  it('announces a server error inline', async () => {
    login.mockRejectedValueOnce(new Error('offline'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('returns to Scanner creation after login from a protected route', async () => {
    login.mockResolvedValueOnce(studentSession);
    render(
      <MemoryRouter initialEntries={['/scanner/new']}>{protectedScannerRoutes()}</MemoryRouter>
    );
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'student@example.test' }
    });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Scanner creation')).toBeInTheDocument();
  });

  it('preserves Scanner return state through registration', async () => {
    registerAccount.mockResolvedValueOnce(studentSession);
    render(
      <MemoryRouter initialEntries={['/scanner/new']}>{protectedScannerRoutes()}</MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Đăng ký' }));
    const [displayName, email] = await screen.findAllByRole('textbox');
    if (!displayName || !email) throw new Error('Registration form fields are missing.');
    fireEvent.change(displayName, { target: { value: 'Student' } });
    fireEvent.change(email, { target: { value: 'student@example.test' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText('Scanner creation')).toBeInTheDocument();
  });

  it('presents registration as the evidence-led start screen', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Khởi tạo quy trình nghiên cứu.')).toBeInTheDocument();
    expect(screen.getByText('WORKSPACE SESSION ENCRYPTED')).toBeInTheDocument();
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Tôi đồng ý với nguyên tắc sử dụng dữ liệu có trách nhiệm')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'MarxMatrix' })).toHaveAttribute('href', '/');
    expect(screen.getByText('03 / RESEARCH PROTOCOL')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Khởi tạo quy trình nghiên cứu.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Scanner → Copilot → Arena')).toBeInTheDocument();
    expect(screen.getByText('Dùng tối thiểu 8 ký tự.')).toBeInTheDocument();
  });

  it('marks the registration form busy while the request is pending', async () => {
    let resolveRegistration: ((value: typeof studentSession) => void) | undefined;
    registerAccount.mockImplementationOnce(
      () =>
        new Promise<typeof studentSession>((resolve) => {
          resolveRegistration = resolve;
        })
    );
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );
    const [displayName, email] = screen.getAllByRole('textbox');
    fireEvent.change(displayName!, { target: { value: 'Student' } });
    fireEvent.change(email!, { target: { value: 'student@example.test' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, {
      target: { value: 'correct horse battery staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByRole('form', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Đang tạo tài khoản…' })).toBeDisabled();
    resolveRegistration?.(studentSession);
  });
});
