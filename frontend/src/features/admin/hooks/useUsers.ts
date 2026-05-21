import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import type { UserId } from '@/shared/types/ids';
import { adminApi } from '../api/admin.api';
import type { AdminUserList, CreateUserInput, ResetPasswordInput, UpdateUserInput } from '../types';

export function useUsers(): UseQueryResult<AdminUserList> {
  return useQuery({
    queryKey: keys.users(),
    queryFn: () => adminApi.listUsers(),
  });
}

export interface UseUserActionsReturn {
  create: (input: CreateUserInput) => Promise<void>;
  update: (userId: UserId, input: UpdateUserInput) => Promise<void>;
  setDisabled: (userId: UserId, disabled: boolean) => Promise<void>;
  resetPassword: (userId: UserId, input: ResetPasswordInput) => Promise<void>;
  remove: (userId: UserId) => Promise<void>;
}

export function useUserActions(): UseUserActionsReturn {
  const qc = useQueryClient();
  const refetch = (): Promise<void> =>
    qc.invalidateQueries({ queryKey: keys.users() }).then(() => undefined);

  const createMut = useMutation({
    mutationFn: (input: CreateUserInput) => adminApi.createUser(input),
    onSuccess: refetch,
  });
  const updateMut = useMutation({
    mutationFn: ({ userId, input }: { userId: UserId; input: UpdateUserInput }) =>
      adminApi.updateUser(userId, input),
    onSuccess: refetch,
  });
  const setDisabledMut = useMutation({
    mutationFn: ({ userId, disabled }: { userId: UserId; disabled: boolean }) =>
      adminApi.setDisabled(userId, disabled),
    onSuccess: refetch,
  });
  const resetPasswordMut = useMutation({
    mutationFn: ({ userId, input }: { userId: UserId; input: ResetPasswordInput }) =>
      adminApi.resetPassword(userId, input),
  });
  const removeMut = useMutation({
    mutationFn: (userId: UserId) => adminApi.deleteUser(userId),
    onSuccess: refetch,
  });

  const create = useCallback(
    async (input: CreateUserInput) => {
      await createMut.mutateAsync(input);
    },
    [createMut],
  );
  const update = useCallback(
    async (userId: UserId, input: UpdateUserInput) => {
      await updateMut.mutateAsync({ userId, input });
    },
    [updateMut],
  );
  const setDisabled = useCallback(
    async (userId: UserId, disabled: boolean) => {
      await setDisabledMut.mutateAsync({ userId, disabled });
    },
    [setDisabledMut],
  );
  const resetPassword = useCallback(
    async (userId: UserId, input: ResetPasswordInput) => {
      await resetPasswordMut.mutateAsync({ userId, input });
    },
    [resetPasswordMut],
  );
  const remove = useCallback(
    async (userId: UserId) => {
      await removeMut.mutateAsync(userId);
    },
    [removeMut],
  );

  return { create, update, setDisabled, resetPassword, remove };
}
