import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/storage/memory';
import { AppApiError } from './errors';
import { refreshAccessToken } from './retry';

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  _skipAuthRefresh?: boolean;
}

export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError)) {
      throw error;
    }
    const config = error.config as RetriableConfig | undefined;

    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config._skipAuthRefresh
    ) {
      config._retried = true;
      try {
        await refreshAccessToken();
        return await apiClient(config);
      } catch {
        throw AppApiError.fromAxios(error);
      }
    }

    throw AppApiError.fromAxios(error);
  },
);

export type AppRequestConfig = AxiosRequestConfig & { _skipAuthRefresh?: boolean };
