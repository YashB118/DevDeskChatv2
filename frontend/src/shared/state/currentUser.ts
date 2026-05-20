import { create } from 'zustand';

interface CurrentUser {
  id: string;
  displayName: string;
}

interface CurrentUserState {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
}

/**
 * Slim accessor for "who's logged in right now". Lives in `shared` so any
 * feature can read it without depending on `features/auth`. The auth feature
 * is responsible for writing to it (on login / logout / refresh).
 */
export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  user: null,
  setUser: (user) => {
    set({ user });
  },
}));

export function useCurrentUserId(): string | null {
  return useCurrentUserStore((s) => s.user?.id ?? null);
}
