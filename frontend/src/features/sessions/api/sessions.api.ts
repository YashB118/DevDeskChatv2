import { apiClient } from '@/lib/http/client';
import {
  CreateSessionInputSchema,
  SessionDTOSchema,
  SessionListSchema,
  SessionQRSchema,
  type CreateSessionInput,
  type SessionDTO,
  type SessionList,
  type SessionQR,
} from '../types';

export const sessionsApi = {
  async list(): Promise<SessionList> {
    const res = await apiClient.get<unknown>('/api/sessions');
    return SessionListSchema.parse(res.data);
  },

  async get(name: string): Promise<SessionDTO> {
    const res = await apiClient.get<unknown>(`/api/sessions/${encodeURIComponent(name)}`);
    return SessionDTOSchema.parse(res.data);
  },

  async create(input: CreateSessionInput): Promise<SessionDTO> {
    const parsed = CreateSessionInputSchema.parse(input);
    const res = await apiClient.post<unknown>('/api/sessions', parsed);
    return SessionDTOSchema.parse(res.data);
  },

  async start(name: string): Promise<SessionDTO> {
    const res = await apiClient.post<unknown>(
      `/api/sessions/${encodeURIComponent(name)}/start`,
    );
    return SessionDTOSchema.parse(res.data);
  },

  async stop(name: string): Promise<SessionDTO> {
    const res = await apiClient.post<unknown>(
      `/api/sessions/${encodeURIComponent(name)}/stop`,
    );
    return SessionDTOSchema.parse(res.data);
  },

  async remove(name: string): Promise<void> {
    await apiClient.delete(`/api/sessions/${encodeURIComponent(name)}`);
  },

  async qr(name: string): Promise<SessionQR> {
    const res = await apiClient.get<unknown>(
      `/api/sessions/${encodeURIComponent(name)}/qr`,
    );
    return SessionQRSchema.parse(res.data);
  },
};
