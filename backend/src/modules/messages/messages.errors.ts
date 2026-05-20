import { AppError } from '@app/shared/errors';

export class MessageNotFoundError extends AppError {
  constructor(stanzaId: string) {
    super({
      code: 'MESSAGE_NOT_FOUND',
      statusCode: 404,
      message: `Message not found: ${stanzaId}`,
      details: { stanzaId },
    });
  }
}

export class InvalidMediaPayloadError extends AppError {
  constructor() {
    super({
      code: 'INVALID_MEDIA_PAYLOAD',
      statusCode: 400,
      message: 'sendMedia requires either `data` or `url`',
    });
  }
}
