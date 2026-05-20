import type { ChatId } from '@/shared/types/ids';

export const routePaths = {
  root: '/',
  login: '/login',
  dashboard: '/dashboard',
  chat: '/dashboard/:chatId',
  settings: '/settings',
  admin: '/admin',
  adminSessions: '/admin/sessions',
  adminAssignments: '/admin/assignments',
  adminUsers: '/admin/users',
  adminFeedback: '/admin/feedback',
  notFound: '*',
} as const;

export const routes = {
  root: (): string => routePaths.root,
  login: (): string => routePaths.login,
  dashboard: (): string => routePaths.dashboard,
  chat: (chatId: ChatId): string => `/dashboard/${chatId}`,
  settings: (): string => routePaths.settings,
  admin: (): string => routePaths.admin,
  adminSessions: (): string => routePaths.adminSessions,
  adminAssignments: (): string => routePaths.adminAssignments,
  adminUsers: (): string => routePaths.adminUsers,
  adminFeedback: (): string => routePaths.adminFeedback,
} as const;

export type RouteKey = keyof typeof routes;
