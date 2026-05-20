import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { AdminGuard } from '@app/common/guards/admin.guard';
import { ZodBody } from '@app/common/decorators/zod-body.decorator';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import {
  CreateSessionSchema,
  type CreateSessionInput,
  SessionNameParamSchema,
} from './session.schema';
import { type SessionDomain, type SessionStatus } from './session.types';
import { SessionsService } from './sessions.service';

interface SessionResponse {
  id: string;
  name: string;
  status: SessionStatus;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function toResponse(s: SessionDomain): SessionResponse {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    config: s.config,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

@Controller('sessions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Get()
  async list(): Promise<{ sessions: SessionResponse[] }> {
    const rows = await this.service.list();
    return { sessions: rows.map(toResponse) };
  }

  @Get(':name')
  async get(
    @Param('name', new ZodValidationPipe(SessionNameParamSchema)) name: string,
  ): Promise<SessionResponse> {
    return toResponse(await this.service.get(name));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@ZodBody(CreateSessionSchema) body: CreateSessionInput): Promise<SessionResponse> {
    return toResponse(await this.service.create(body));
  }

  @Post(':name/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @Param('name', new ZodValidationPipe(SessionNameParamSchema)) name: string,
  ): Promise<SessionResponse> {
    return toResponse(await this.service.start(name));
  }

  @Post(':name/stop')
  @HttpCode(HttpStatus.OK)
  async stop(
    @Param('name', new ZodValidationPipe(SessionNameParamSchema)) name: string,
  ): Promise<SessionResponse> {
    return toResponse(await this.service.stop(name));
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('name', new ZodValidationPipe(SessionNameParamSchema)) name: string,
  ): Promise<void> {
    await this.service.delete(name);
  }

  @Get(':name/qr')
  qr(
    @Param('name', new ZodValidationPipe(SessionNameParamSchema)) name: string,
  ): Promise<{ mimetype: string; data: string }> {
    return this.service.qr(name);
  }
}
