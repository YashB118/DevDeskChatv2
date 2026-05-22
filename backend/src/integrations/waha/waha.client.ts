import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosRequestConfig, AxiosError } from 'axios';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { ExternalServiceError } from '@app/shared/errors';
import {
  type DeleteMessageParams,
  type EditMessageParams,
  type ForwardMessageParams,
  type ListChatsParams,
  type ListMessagesParams,
  type ReactToMessageParams,
  type SendMediaParams,
  type SendTextParams,
  type WahaChat,
  type WahaMessage,
  type WahaQrCode,
  type WahaSession,
} from './waha.types';

/**
 * Pure typed axios wrapper for the WAHA HTTP API.
 *
 * No caching, retry, or circuit breaker — those live in `WahaService`.
 * Failures surface as `ExternalServiceError` with the upstream cause.
 */
@Injectable()
export class WahaClient {
  private readonly logger = new Logger(WahaClient.name);
  private readonly http: AxiosInstance;
  private readonly mediaTimeoutMs: number;

  constructor(@Inject(APP_CONFIG) env: AppConfig) {
    this.mediaTimeoutMs = env.WAHA_MEDIA_TIMEOUT_MS;
    this.http = axios.create({
      baseURL: env.WAHA_BASE_URL,
      timeout: env.WAHA_TIMEOUT_MS,
      headers: env.WAHA_API_KEY === undefined ? {} : { 'X-Api-Key': env.WAHA_API_KEY },
    });
  }

  // ----- Sessions -----
  listSessions(): Promise<WahaSession[]> {
    return this.get<WahaSession[]>('/api/sessions');
  }

  getSession(name: string): Promise<WahaSession> {
    return this.get<WahaSession>(`/api/sessions/${encodeURIComponent(name)}`);
  }

  /**
   * Register a session in WAHA. Required before `startSession` — WAHA returns
   * 422 on `/start` for an unknown session. Pass `start:true` to fuse create+start
   * into a single round-trip.
   */
  createSession(
    name: string,
    options: { start?: boolean; config?: unknown } = {},
  ): Promise<WahaSession> {
    const body: Record<string, unknown> = { name };
    if (options.start !== undefined) body.start = options.start;
    if (options.config !== undefined) body.config = options.config;
    return this.post<WahaSession>('/api/sessions', body);
  }

  startSession(name: string): Promise<WahaSession> {
    return this.post<WahaSession>(`/api/sessions/${encodeURIComponent(name)}/start`, {});
  }

  stopSession(name: string): Promise<WahaSession> {
    return this.post<WahaSession>(`/api/sessions/${encodeURIComponent(name)}/stop`, {});
  }

  async deleteSession(name: string): Promise<void> {
    await this.delete(`/api/sessions/${encodeURIComponent(name)}`);
  }

  getQrCode(name: string): Promise<WahaQrCode> {
    return this.get<WahaQrCode>(`/api/sessions/${encodeURIComponent(name)}/auth/qr`);
  }

  // ----- Chats -----
  listChats(session: string, params: ListChatsParams = {}): Promise<WahaChat[]> {
    return this.get<WahaChat[]>(`/api/${encodeURIComponent(session)}/chats`, { params });
  }

  // ----- Messages -----
  listMessages(
    session: string,
    chatId: string,
    params: ListMessagesParams = {},
  ): Promise<WahaMessage[]> {
    return this.get<WahaMessage[]>(
      `/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/messages`,
      {
        params,
      },
    );
  }

  sendText(params: SendTextParams): Promise<WahaMessage> {
    return this.post<WahaMessage>('/api/sendText', params);
  }

  sendMedia(params: SendMediaParams): Promise<WahaMessage> {
    const path = this.mediaPathFor(params);
    return this.post<WahaMessage>(path, params, { timeout: this.mediaTimeoutMs });
  }

  private mediaPathFor(params: SendMediaParams): string {
    if (params.asDocument === true) return '/api/sendFile';
    const mime = params.file.mimetype.toLowerCase();
    if (mime.startsWith('image/')) return '/api/sendImage';
    if (mime.startsWith('video/')) return '/api/sendVideo';
    if (mime.startsWith('audio/')) return '/api/sendVoice';
    return '/api/sendFile';
  }

  editMessage(params: EditMessageParams): Promise<WahaMessage> {
    return this.put<WahaMessage>('/api/editMessage', params);
  }

  async deleteMessage(params: DeleteMessageParams): Promise<void> {
    await this.post('/api/deleteMessage', params);
  }

  async reactToMessage(params: ReactToMessageParams): Promise<void> {
    await this.put('/api/reaction', params);
  }

  forwardMessage(params: ForwardMessageParams): Promise<WahaMessage> {
    return this.post<WahaMessage>('/api/forwardMessage', params);
  }

  // ----- internals -----
  private async get<R = unknown>(url: string, config: AxiosRequestConfig = {}): Promise<R> {
    return this.request<R>({ ...config, method: 'GET', url });
  }

  private async post<R = unknown>(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<R> {
    return this.request<R>({ ...config, method: 'POST', url, data });
  }

  private async put<R = unknown>(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<R> {
    return this.request<R>({ ...config, method: 'PUT', url, data });
  }

  private async delete<R = unknown>(url: string, config: AxiosRequestConfig = {}): Promise<R> {
    return this.request<R>({ ...config, method: 'DELETE', url });
  }

  private async request<R>(config: AxiosRequestConfig): Promise<R> {
    try {
      const res = await this.http.request<R>(config);
      return res.data;
    } catch (err) {
      throw this.wrap(err, config);
    }
  }

  private wrap(err: unknown, config: AxiosRequestConfig): ExternalServiceError {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const code = status !== undefined && status >= 500 ? 'WAHA_5XX' : 'WAHA_HTTP_ERROR';
      const message = `WAHA ${config.method ?? 'GET'} ${config.url ?? ''} failed${
        status === undefined ? '' : ` (${String(status)})`
      }`;
      this.logger.warn(`${message}: ${err.message}`);
      return new ExternalServiceError(message, {
        code,
        details: {
          method: config.method,
          url: config.url,
          ...(status === undefined ? {} : { status }),
          ...(err.code === undefined ? {} : { axiosCode: err.code }),
        },
        cause: err,
      });
    }
    return new ExternalServiceError('WAHA request failed', { code: 'WAHA_UNKNOWN', cause: err });
  }
}
