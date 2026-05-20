import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/primitives/Dialog';
import { Button } from '@/design-system/primitives/Button';
import { Input } from '@/design-system/primitives/Input';
import { useToast } from '@/design-system/primitives/Toast';
import { AppApiError } from '@/lib/http/errors';
import { useUserActions } from '../../hooks/useUsers';
import { CreateUserInputSchema, type CreateUserInput } from '../../types';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps): ReactElement {
  const { create } = useUserActions();
  const { push } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserInputSchema),
    defaultValues: { email: '', displayName: '', password: '', role: 'DEVELOPER' },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create(values);
      push({ title: 'User created', description: undefined, tone: 'success' });
      onOpenChange(false);
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : 'Failed to create user';
      push({ title: 'Failed', description: msg, tone: 'danger' });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create developer</DialogTitle>
          <DialogDescription>Adds a new user to the workspace.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void onSubmit(e);
          }}
          noValidate
          className="flex flex-col gap-3"
        >
          <div className="space-y-1">
            <label htmlFor="new-user-email" className="text-[length:var(--text-sm)] font-medium">
              Email
            </label>
            <Input
              id="new-user-email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'new-user-email-err' : undefined}
              {...register('email')}
            />
            {errors.email ? (
              <p
                id="new-user-email-err"
                role="alert"
                className="text-[length:var(--text-sm)] text-[var(--color-danger)]"
              >
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="new-user-name" className="text-[length:var(--text-sm)] font-medium">
              Display name
            </label>
            <Input
              id="new-user-name"
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby={errors.displayName ? 'new-user-name-err' : undefined}
              {...register('displayName')}
            />
            {errors.displayName ? (
              <p
                id="new-user-name-err"
                role="alert"
                className="text-[length:var(--text-sm)] text-[var(--color-danger)]"
              >
                {errors.displayName.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="new-user-password" className="text-[length:var(--text-sm)] font-medium">
              Initial password
            </label>
            <Input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'new-user-password-err' : undefined}
              {...register('password')}
            />
            {errors.password ? (
              <p
                id="new-user-password-err"
                role="alert"
                className="text-[length:var(--text-sm)] text-[var(--color-danger)]"
              >
                {errors.password.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="new-user-role" className="text-[length:var(--text-sm)] font-medium">
              Role
            </label>
            <select
              id="new-user-role"
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] px-2"
              {...register('role')}
            >
              <option value="DEVELOPER">Developer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
              Create
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
