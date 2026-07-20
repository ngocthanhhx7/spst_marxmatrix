import { zodResolver } from '@hookform/resolvers/zod';
import { registerInputSchema, type RegisterInput } from '@marxmatrix/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../shared/api/api-error.js';
import { AuthFrame } from '../../shared/ui/AuthFrame.js';
import { register as registerAccount } from './api.js';
import { getSafeReturnPath } from './return-path.js';
import { useSessionStore } from './session.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getSafeReturnPath(location.state as unknown);
  const returnState = returnPath === '/dashboard' ? undefined : { from: returnPath };
  const set = useSessionStore((state) => state.setSession);
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError
  } = useForm<RegisterInput>({ resolver: zodResolver(registerInputSchema) });
  const submit = async (data: RegisterInput) => {
    if (confirmation.length > 0 && confirmation !== data.password) {
      setError('root', { message: 'Xác nhận mật khẩu chưa khớp.' });
      return;
    }
    try {
      const session = await registerAccount(data);
      set(session);
      void navigate(returnPath, { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Không thể đăng ký. Vui lòng thử lại.'
      });
    }
  };
  return (
    <AuthFrame variant="register">
      <section className="auth-card">
        <p className="auth-card__eyebrow">ACCOUNT SETUP / 03</p>
        <h2>Thông tin đăng ký</h2>
        <p className="auth-card__return-context">Scanner → Copilot → Arena</p>
        {returnPath !== '/dashboard' && (
          <p className="auth-card__return-context">
            Bạn sẽ trở lại công việc đang mở sau khi tạo tài khoản.
          </p>
        )}
        <form
          noValidate
          aria-label="Tạo tài khoản"
          aria-busy={isSubmitting}
          onSubmit={(event) => void handleSubmit(submit)(event)}
        >
          <label>
            Họ và tên
            <input
              autoComplete="name"
              aria-invalid={errors.displayName !== undefined}
              aria-describedby={errors.displayName ? 'register-name-error' : undefined}
              {...register('displayName')}
            />
          </label>
          {errors.displayName && (
            <p id="register-name-error" role="alert">
              {errors.displayName.message}
            </p>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              {...register('email')}
            />
          </label>
          {errors.email && (
            <p id="register-email-error" role="alert">
              {errors.email.message}
            </p>
          )}
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password !== undefined}
              aria-describedby={
                errors.password
                  ? 'register-password-help register-password-error'
                  : 'register-password-help'
              }
              {...register('password')}
            />
          </label>
          <ul id="register-password-help" className="auth-card__password-list">
            <li>Dùng tối thiểu 8 ký tự.</li>
            <li>Dùng mật khẩu riêng cho MarxMatrix</li>
          </ul>
          {errors.password && (
            <p id="register-password-error" role="alert">
              {errors.password.message}
            </p>
          )}
          <label>
            Xác nhận mật khẩu
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <label className="auth-card__check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            Tôi đồng ý với nguyên tắc sử dụng dữ liệu có trách nhiệm
          </label>
          {errors.root && (
            <p id="register-form-error" role="alert" aria-live="assertive">
              {errors.root.message}
            </p>
          )}
          <button className="auth-card__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          </button>
        </form>
        <p className="auth-card__divider">HOẶC</p>
        <button className="auth-card__google" type="button" disabled aria-disabled="true">
          Tiếp tục với Google
        </button>
        <p className="auth-card__alternate">
          Đã có tài khoản?{' '}
          <Link to="/login" state={returnState}>
            Đăng nhập
          </Link>
        </p>
      </section>
    </AuthFrame>
  );
}
