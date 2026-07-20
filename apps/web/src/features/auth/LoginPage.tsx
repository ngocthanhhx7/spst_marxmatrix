import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@marxmatrix/contracts';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../shared/api/api-error.js';
import { AuthFrame } from '../../shared/ui/AuthFrame.js';
import { login } from './api.js';
import { getSafeReturnPath } from './return-path.js';
import { useSessionStore } from './session.js';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getSafeReturnPath(location.state as unknown);
  const returnState = returnPath === '/dashboard' ? undefined : { from: returnPath };
  const set = useSessionStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) });
  const submit = async (data: LoginInput) => {
    try {
      const session = await login(data);
      set(session);
      void navigate(returnPath, { replace: true });
    } catch (error) {
      setError('root', {
        message:
          error instanceof ApiError ? error.message : 'Không thể đăng nhập. Vui lòng thử lại.'
      });
    }
  };
  return (
    <AuthFrame variant="login">
      <section className="auth-card">
        <p className="auth-card__eyebrow">ACCOUNT ACCESS / 02</p>
        <h2>Tiếp tục điều tra</h2>
        {returnPath !== '/dashboard' && (
          <p className="auth-card__return-context">
            Bạn sẽ trở lại công việc đang mở sau khi đăng nhập.
          </p>
        )}
        <form
          noValidate
          aria-label="Đăng nhập"
          aria-busy={isSubmitting}
          onSubmit={(event) => void handleSubmit(submit)(event)}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              {...register('email')}
            />
          </label>
          {errors.email && (
            <p id="login-email-error" role="alert">
              {errors.email.message}
            </p>
          )}
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password !== undefined}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              {...register('password')}
            />
          </label>
          {errors.password && (
            <p id="login-password-error" role="alert">
              {errors.password.message}
            </p>
          )}
          <div className="auth-card__row">
            <label className="auth-card__check">
              <input type="checkbox" name="remember-session" />
              Ghi nhớ phiên đăng nhập
            </label>
            <span className="auth-card__forgot">Quên mật khẩu?</span>
          </div>
          {errors.root && (
            <p id="login-form-error" role="alert" aria-live="assertive">
              {errors.root.message}
            </p>
          )}
          <button className="auth-card__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="auth-card__divider">HOẶC</p>
        <button className="auth-card__google" type="button" disabled aria-disabled="true">
          Tiếp tục với Google
        </button>
        <p className="auth-card__alternate">
          Chưa có tài khoản?{' '}
          <Link to="/register" state={returnState}>
            Đăng ký
          </Link>
        </p>
      </section>
    </AuthFrame>
  );
}
