import { registerSyncHandler } from '@/realtime';
import { registerChatsSync } from '@/features/chats';
import { registerMessagesSync } from '@/features/messages';
import { registerSessionsSync } from '@/features/sessions';
import { registerAssignmentsSync } from '@/features/assignments';
import { registerAdminSync } from '@/features/admin';
import { registerFeedbackSync } from '@/features/feedback';

let registered = false;

export function ensureFeatureSyncRegistered(): void {
  if (registered) return;
  registered = true;
  registerSyncHandler(registerChatsSync);
  registerSyncHandler(registerMessagesSync);
  registerSyncHandler(registerSessionsSync);
  registerSyncHandler(registerAssignmentsSync);
  registerSyncHandler(registerAdminSync);
  registerSyncHandler(registerFeedbackSync);
}
