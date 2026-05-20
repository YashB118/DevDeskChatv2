import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/design-system/primitives/Button';
import { Input } from '@/design-system/primitives/Input';
import { AppApiError } from '@/lib/http/errors';
import { useAuth } from '../hooks/useAuth';
import { PasswordChangeInputSchema, type PasswordChangeInput } from '../types';

interface PasswordChangeFormProps {
  onSuccess?: () => void;
}

export function PasswordChangeForm({ onSuccess }: PasswordChangeFormProps): ReactElement {
  const { changePassword } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeInput>({
    resolver: zodResolver(PasswordChangeInputSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSuccess(false);
    try {
      await changePassword(values);
      setSuccess(true);
      reset();
      onSuccess?.();
    } catch (err) {
      setFormError(AppApiError.isAppApiError(err) ? err.message : 'Could not change password.');
    }
  });

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      noValidate
      aria-label="Change password"
      className="space-y-4"
    >
      <div className="space-y-1">
        <label htmlFor="pwd-current" className="text-[length:var(--text-sm)] font-medium">
          Current password
        </label>
        <Input
          id="pwd-current"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.currentPassword ? true : undefined}
          {...register('currentPassword')}
        />
        {errors.currentPassword ? (
          <p role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
            {errors.currentPassword.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="pwd-new" className="text-[length:var(--text-sm)] font-medium">
          New password
        </label>
        <Input
          id="pwd-new"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.newPassword ? true : undefined}
          {...register('newPassword')}
        />
        {errors.newPassword ? (
          <p role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
            {errors.newPassword.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="pwd-confirm" className="text-[length:var(--text-sm)] font-medium">
          Confirm new password
        </label>
        <Input
          id="pwd-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? (
          <p role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-[length:var(--text-sm)] text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}

      {success ? (
        <p role="status" className="text-[length:var(--text-sm)] text-[var(--color-success)]">
          Password updated.
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
        Update password
      </Button>
    </form>
  );
}
