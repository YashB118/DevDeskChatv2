import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { applyAssigned, applyUnassigned } from './assignments.mutations';
import type { AssignmentDTO, AssignmentList } from '../types';

function row(over: Partial<AssignmentDTO> = {}): AssignmentDTO {
  return {
    chatId: 'c-1',
    chatTitle: 'Alice',
    assignedTo: null,
    assignedToName: null,
    updatedAt: 0,
    ...over,
  };
}

function cache(items: AssignmentDTO[]): InfiniteData<AssignmentList> {
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}

describe('assignments mutations', () => {
  it('applyAssigned sets assignedTo on the target chat only', () => {
    const data = cache([row({ chatId: 'c-1' }), row({ chatId: 'c-2' })]);
    const next = applyAssigned(data, { chatId: 'c-1', assignedTo: 'u-9' });
    expect(next!.pages[0]!.items[0]!.assignedTo).toBe('u-9');
    expect(next!.pages[0]!.items[1]!.assignedTo).toBeNull();
  });

  it('applyUnassigned clears assignedTo + name', () => {
    const data = cache([row({ chatId: 'c-1', assignedTo: 'u-9', assignedToName: 'Yash' })]);
    const next = applyUnassigned(data, { chatId: 'c-1' });
    expect(next!.pages[0]!.items[0]!.assignedTo).toBeNull();
    expect(next!.pages[0]!.items[0]!.assignedToName).toBeNull();
  });

  it('is a pass-through for undefined data', () => {
    expect(applyAssigned(undefined, { chatId: 'c-1', assignedTo: 'u-1' })).toBeUndefined();
    expect(applyUnassigned(undefined, { chatId: 'c-1' })).toBeUndefined();
  });
});
