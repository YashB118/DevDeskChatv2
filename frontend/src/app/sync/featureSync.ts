import { registerSyncHandler } from '@/realtime';
import { registerChatsSync } from '@/features/chats';
import { registerMessagesSync } from '@/features/messages';

let registered = false;

export function ensureFeatureSyncRegistered(): void {
  if (registered) return;
  registered = true;
  registerSyncHandler(registerChatsSync);
  registerSyncHandler(registerMessagesSync);
}
