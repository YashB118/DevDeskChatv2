import type { InfiniteData } from '@tanstack/react-query';
import type {
  ChatAssignmentPayload,
  ChatUnassignmentPayload,
} from '@/realtime/events.contract';
import type { AssignmentDTO, AssignmentList } from '../types';

type Pages = InfiniteData<AssignmentList> | undefined;

function mapItems(data: Pages, fn: (a: AssignmentDTO) => AssignmentDTO): Pages {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, items: p.items.map(fn) })),
  };
}

export function applyAssigned(data: Pages, p: ChatAssignmentPayload): Pages {
  if (!data) return data;
  // Match by assignmentId so we mutate the right row; if no matching row
  // exists yet, prepend a new one to the first page so new assignments show
  // up immediately instead of being dropped.
  const state = { found: false };
  const next = mapItems(data, (a) => {
    if (a.id === p.assignmentId) {
      state.found = true;
      return {
        ...a,
        chatId: p.chatId,
        userId: p.userId,
        assignedBy: p.assignedBy,
        assignedAt: p.assignedAt,
        isActive: true,
        unassignedAt: null,
      };
    }
    return a;
  });
  if (state.found) return next;
  const newRow: AssignmentDTO = {
    id: p.assignmentId,
    chatId: p.chatId,
    userId: p.userId,
    wahaSessionId: null,
    assignedBy: p.assignedBy,
    assignedAt: p.assignedAt,
    unassignedAt: null,
    isActive: true,
  };
  if (!next) {
    return {
      pages: [{ items: [newRow], nextCursor: null }],
      pageParams: [null],
    };
  }
  const firstPage = next.pages[0];
  if (!firstPage) {
    return { ...next, pages: [{ items: [newRow], nextCursor: null }] };
  }
  return {
    ...next,
    pages: [{ ...firstPage, items: [newRow, ...firstPage.items] }, ...next.pages.slice(1)],
  };
}

export function applyUnassigned(data: Pages, p: ChatUnassignmentPayload): Pages {
  // Key by assignmentId — keying by chatId would corrupt historical rows for
  // the same chat that have already been unassigned.
  return mapItems(data, (a) =>
    a.id === p.assignmentId
      ? {
          ...a,
          isActive: false,
          unassignedAt: p.unassignedAt,
          assignedToName: null,
        }
      : a,
  );
}
