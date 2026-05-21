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
  return mapItems(data, (a) =>
    a.chatId === p.chatId
      ? {
          ...a,
          id: p.assignmentId,
          userId: p.userId,
          assignedBy: p.assignedBy,
          assignedAt: p.assignedAt,
          isActive: true,
          unassignedAt: null,
        }
      : a,
  );
}

export function applyUnassigned(data: Pages, p: ChatUnassignmentPayload): Pages {
  return mapItems(data, (a) =>
    a.chatId === p.chatId
      ? {
          ...a,
          id: p.assignmentId,
          isActive: false,
          unassignedAt: p.unassignedAt,
          assignedToName: null,
        }
      : a,
  );
}
