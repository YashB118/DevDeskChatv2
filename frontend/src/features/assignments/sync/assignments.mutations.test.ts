import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { applyAssigned, applyUnassigned } from './assignments.mutations';
import type { AssignmentDTO, AssignmentList } from '../types';

function row(over: Partial<AssignmentDTO> = {}): AssignmentDTO {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    userId: '00000000-0000-0000-0000-000000000001',
    chatId: 'c-1',
    wahaSessionId: null,
    assignedBy: null,
    assignedAt: '2026-01-01T00:00:00.000Z',
    unassignedAt: null,
    isActive: true,
    chatTitle: 'Alice',
    assignedToName: null,
    ...over,
  };
}

function cache(items: AssignmentDTO[]): InfiniteData<AssignmentList> {
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}

describe('assignments mutations', () => {
  it('applyAssigned writes userId + flips isActive on the matched chat only', () => {
    const data = cache([
      row({ chatId: 'c-1', isActive: false }),
      row({ chatId: 'c-2', userId: 'u-orig' }),
    ]);
    const next = applyAssigned(data, {
      assignmentId: '00000000-0000-0000-0000-0000000000aa',
      userId: '00000000-0000-0000-0000-0000000000bb',
      chatId: 'c-1',
      assignedBy: null,
      assignedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(next!.pages[0]!.items[0]!.userId).toBe('00000000-0000-0000-0000-0000000000bb');
    expect(next!.pages[0]!.items[0]!.isActive).toBe(true);
    expect(next!.pages[0]!.items[0]!.id).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(next!.pages[0]!.items[1]!.userId).toBe('u-orig');
  });

  it('applyUnassigned flips isActive, clears name, records backend unassignedAt', () => {
    const data = cache([row({ chatId: 'c-1', userId: 'u-9', assignedToName: 'Yash' })]);
    const next = applyUnassigned(data, {
      assignmentId: '00000000-0000-0000-0000-0000000000aa',
      userId: '00000000-0000-0000-0000-000000000001',
      chatId: 'c-1',
      unassignedBy: null,
      unassignedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(next!.pages[0]!.items[0]!.isActive).toBe(false);
    expect(next!.pages[0]!.items[0]!.assignedToName).toBeNull();
    expect(next!.pages[0]!.items[0]!.unassignedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('is a pass-through for undefined data', () => {
    expect(
      applyAssigned(undefined, {
        assignmentId: '00000000-0000-0000-0000-0000000000aa',
        userId: '00000000-0000-0000-0000-000000000001',
        chatId: 'c-1',
        assignedBy: null,
        assignedAt: '2026-02-01T00:00:00.000Z',
      }),
    ).toBeUndefined();
  });
});
