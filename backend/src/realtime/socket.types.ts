import { type DefaultEventsMap, type Socket } from 'socket.io';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';

export interface AuthedSocketData {
  user?: AuthenticatedRequestUser;
}

export type AuthedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  AuthedSocketData
>;
