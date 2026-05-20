export interface AssignmentDomain {
  id: string;
  userId: string;
  chatId: string;
  wahaSessionId: string | null;
  assignedBy: string | null;
  assignedAt: Date;
  unassignedAt: Date | null;
  isActive: boolean;
}

export interface AssignmentHistoryDomain {
  id: string;
  assignmentId: string;
  event: 'ASSIGNED' | 'UNASSIGNED' | 'REASSIGNED';
  actorId: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
}
