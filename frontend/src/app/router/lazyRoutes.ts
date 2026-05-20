import type * as AdminChunk from './pages/admin';

export const loadAdminChunk = (): Promise<typeof AdminChunk> => import('./pages/admin');
