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
import { AppApiError } from '@/lib/http/errors';
import { useToast } from '@/design-system/primitives/Toast';
import { useSessionMutations } from '../../hooks/useSessions';
import { CreateSessionInputSchema, type CreateSessionInput } from '../../types';

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function CreateSessionDialog({
  open,
  onOpenChange,
}: CreateSessionDialogProps): ReactElement {
  const { create } = useSessionMutations();
  const { push } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateSessionInput>({
    resolver: zodResolver(CreateSessionInputSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create(values);
      push({ title: 'Session created', description: undefined, tone: 'success' });
      onOpenChange(false);
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : 'Failed to create session';
      push({ title: 'Failed', description: msg, tone: 'danger' });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create session</DialogTitle>
          <DialogDescription>
            Name your WAHA session. Letters, digits, underscore, hyphen.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void onSubmit(e);
          }}
          noValidate
          className="flex flex-col gap-3"
        >
          <div className="space-y-1">
            <label htmlFor="session-name" className="text-[length:var(--text-sm)] font-medium">
              Name
            </label>
            <Input
              id="session-name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'session-name-err' : undefined}
              placeholder="support-eu"
              {...register('name')}
            />
            {errors.name ? (
              <p
                id="session-name-err"
                role="alert"
                className="text-[length:var(--text-sm)] text-[var(--color-danger)]"
              >
                {errors.name.message}
              </p>
            ) : null}
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
