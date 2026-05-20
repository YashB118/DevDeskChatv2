import { AppError } from '@app/shared/errors';

export class AssignmentAlreadyExistsError extends AppError {
  constructor(userId: string, chatId: string) {
    super({
      code: 'ASSIGNMENT_EXISTS',
      statusCode: 409,
      message: 'Active assignment already exists for this user and chat',
      details: { userId, chatId },
    });
  }
}

export class AssignmentNotFoundError extends AppError {
  constructor(id: string) {
    super({
      code: 'ASSIGNMENT_NOT_FOUND',
      statusCode: 404,
      message: `Assignment not found: ${id}`,
      details: { id },
    });
  }
}
