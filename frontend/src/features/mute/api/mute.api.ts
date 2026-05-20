import { apiClient } from '@/lib/http/client';
import { GlobalMuteSchema, type GlobalMute } from '../types';

export const muteApi = {
  async get(): Promise<GlobalMute> {
    const res = await apiClient.get<unknown>('/api/mute/global');
    return GlobalMuteSchema.parse(res.data);
  },
  async set(muted: boolean): Promise<GlobalMute> {
    const res = await apiClient.patch<unknown>('/api/mute/global', { muted });
    return GlobalMuteSchema.parse(res.data);
  },
};
