import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { type ServerOptions, type Server as IoServer } from 'socket.io';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { type RedisClient } from '@app/infra/cache/redis.provider';

/**
 * Custom Socket.IO adapter that wires `@socket.io/redis-adapter` for
 * horizontal fan-out across pods.
 *
 * Two distinct ioredis clients are required (pub + sub). We duplicate the
 * shared client so the existing connection config (URL, keyPrefix, retry
 * strategy) is reused without spawning yet another configured instance.
 *
 * Duplicated clients are owned by this adapter and disconnected on app
 * shutdown.
 */
export class SocketRedisAdapter extends IoAdapter {
  private readonly logger = new Logger(SocketRedisAdapter.name);
  private pubClient: RedisClient | null = null;
  private subClient: RedisClient | null = null;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): IoServer {
    const server = super.createIOServer(port, options) as IoServer;
    const root = this.app.get<RedisClient>(REDIS_CLIENT, { strict: false });
    this.pubClient = root.duplicate();
    this.subClient = root.duplicate();
    this.pubClient.on('error', (e: Error) => {
      this.logger.error(`redis pub error: ${e.message}`);
    });
    this.subClient.on('error', (e: Error) => {
      this.logger.error(`redis sub error: ${e.message}`);
    });
    server.adapter(createAdapter(this.pubClient, this.subClient));
    this.logger.log('socket.io redis adapter installed');
    return server;
  }

  override async close(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter((c): c is RedisClient => c !== null);
    await Promise.allSettled(
      clients.map(async (c) => {
        if (c.status === 'end') return;
        try {
          await c.quit();
        } catch {
          c.disconnect();
        }
      }),
    );
    this.pubClient = null;
    this.subClient = null;
  }
}
