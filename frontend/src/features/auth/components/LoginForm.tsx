import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/design-system/primitives/Button';
import { Input } from '@/design-system/primitives/Input';
import { AppApiError } from '@/lib/http/errors';
import { useAuth } from '../hooks/useAuth';
import { LoginInputSchema, type LoginInput } from '../types';

interface LoginFormProps {
  onSuccess?: () => void;
}

const errorCodeMap: Record<string, { field?: keyof LoginInput; message: string }> = {
  INVALID_CREDENTIALS: { field: 'password', message: 'Email or password is incorrect.' },
  USER_DISABLED: { message: 'This account has been disabled.' },
  RATE_LIMITED: { message: 'Too many attempts. Try again in a moment.' },
};

export function LoginForm({ onSuccess }: LoginFormProps): ReactElement {
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginInputSchema),
    mode: 'onSubmit',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      onSuccess?.();
    } catch (err) {
      if (AppApiError.isAppApiError(err)) {
        const mapped = errorCodeMap[err.code];
        if (mapped?.field) {
          setError(mapped.field, { type: 'server', message: mapped.message });
        } else {
          setFormError(mapped?.message ?? err.message);
        }
      } else {
        setFormError('Login failed. Try again.');
      }
    }
  });

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      noValidate
      aria-label="Sign in"
      className="space-y-4"
    >
      <div className="space-y-1">
        <label htmlFor="login-email" className="text-[length:var(--text-sm)] font-medium">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'login-email-err' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="login-email-err" role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="login-password" className="text-[length:var(--text-sm)] font-medium">
          Password
        </label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'login-password-err' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p id="login-password-err" role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
