import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { WahaService } from '@app/integrations/waha/waha.service';
import { CacheService } from '@app/infra/cache/cache.service';
import { type UserDomain } from '@app/modules/users/user.types';
import { ChatMetadataRepository } from './chat-metadata.repository';
import { ChatPolicy } from './chat.policy';
import { type ListChatsQuery } from './chat.schema';

export interface EnrichedChatLastMessage {
  id: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
}

export interface EnrichedChat {
  id: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: EnrichedChatLastMessage | null;
  displayNameOverride: string | null;
  lastSeenAt: string | null;
  muted: boolean;
}

const EnrichedChatLastMessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  timestamp: z.number(),
  fromMe: z.boolean(),
});

const EnrichedChatSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  isGroup: z.boolean(),
  unreadCount: z.number(),
  lastMessage: EnrichedChatLastMessageSchema.nullable(),
  displayNameOverride: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  muted: z.boolean(),
});

const CachedChatListSchema = z.array(EnrichedChatSchema);

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);
  private static readonly CACHE_TTL_SECONDS = 10;

  constructor(
    private readonly waha: WahaService,
    private readonly metadata: ChatMetadataRepository,
    private readonly cache: CacheService,
    private readonly policy: ChatPolicy,
  ) {}

  async list(user: UserDomain, query: ListChatsQuery): Promise<EnrichedChat[]> {
    const cacheKey = this.cacheKey(user.id, query);
    return this.cache.wrap(
      cacheKey,
      async () => {
        const upstream = await this.waha.listChats(query.session, {
          limit: query.limit,
          offset: query.offset,
        });
        const deduped = dedupe(upstream);
        const visibleIds = this.policy.filterVisibleChatIds(
          user,
          deduped.map((c) => c.id),
        );
        const visible = deduped.filter((c) => visibleIds.includes(c.id));
        return this.enrich(visible);
      },
      { ttlSeconds: ChatsService.CACHE_TTL_SECONDS, schema: CachedChatListSchema },
    );
  }

  async markRead(user: UserDomain, chatId: string): Promise<void> {
    if (!this.policy.canWriteChat(user, chatId)) {
      throw new Error('forbidden');
    }
    await this.metadata.setLastSeen(chatId, new Date());
    // Invalidate cache so the unread count refreshes on next list call.
    await this.invalidateUserCache(user.id);
  }

  async sync(user: UserDomain, session: string): Promise<EnrichedChat[]> {
    await this.invalidateUserCache(user.id);
    this.waha.invalidateChats(session);
    return this.list(user, { session, limit: 50, offset: 0 });
  }

  private async enrich(
    chats: {
      id: string;
      name?: string | null | undefined;
      isGroup?: boolean | undefined;
      unreadCount?: number | undefined;
      lastMessage?:
        | {
            id?: string | undefined;
            body?: string | undefined;
            timestamp?: number | undefined;
            fromMe?: boolean | undefined;
          }
        | null
        | undefined;
    }[],
  ): Promise<EnrichedChat[]> {
    const metadata = await Promise.all(chats.map((c) => this.metadata.findByChatId(c.id)));
    return chats.map((c, i) => {
      const meta = metadata[i] ?? null;
      const lm = c.lastMessage ?? null;
      const lastMessage: EnrichedChatLastMessage | null =
        lm?.id === undefined ||
        lm.body === undefined ||
        lm.timestamp === undefined ||
        lm.fromMe === undefined
          ? null
          : { id: lm.id, body: lm.body, timestamp: lm.timestamp, fromMe: lm.fromMe };
      return {
        id: c.id,
        name: c.name ?? null,
        isGroup: c.isGroup ?? false,
        unreadCount: c.unreadCount ?? 0,
        lastMessage,
        displayNameOverride: meta?.displayNameOverride ?? null,
        lastSeenAt: meta?.lastSeenAt?.toISOString() ?? null,
        muted: false, // Phase-9 mute table wires the real value here.
      };
    });
  }

  private cacheKey(userId: string, query: ListChatsQuery): string {
    return `chats:list:${userId}:${query.session}:${String(query.limit)}:${String(query.offset)}`;
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    // Keyspace `chats:list:<user>:*` — the existing CacheService has no SCAN
    // helper, so the simplest correct thing is to drop the known prefixes the
    // UI uses. We delete the default-page key explicitly and rely on the 10s
    // TTL to flush long-tail pages quickly.
    await this.cache.del(`chats:list:${userId}:default:50:0`);
  }
}

/**
 * Dedup by chat id — the WAHA chat list already deduplicates phone↔LID
 * variants when the NOWEB store is healthy. The richer phone-vs-LID
 * preference logic lives in [[jid#dedupeChats]] and is exercised against
 * sources that surface both variants.
 */
function dedupe<T extends { id: string }>(chats: T[]): T[] {
  const seen = new Map<string, T>();
  for (const chat of chats) {
    if (!seen.has(chat.id)) seen.set(chat.id, chat);
  }
  return [...seen.values()];
}
