import type { InfiniteData } from '@tanstack/react-query';
import type {
  ChatAssignedPayload,
  ChatUnassignedPayload,
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

export function applyAssigned(data: Pages, p: ChatAssignedPayload): Pages {
  return mapItems(data, (a) =>
    a.chatId === p.chatId
      ? { ...a, assignedTo: p.assignedTo, assignedToName: a.assignedToName, updatedAt: Date.now() }
      : a,
  );
}

export function applyUnassigned(data: Pages, p: ChatUnassignedPayload): Pages {
  return mapItems(data, (a) =>
    a.chatId === p.chatId ? { ...a, assignedTo: null, assignedToName: null, updatedAt: Date.now() } : a,
  );
}
