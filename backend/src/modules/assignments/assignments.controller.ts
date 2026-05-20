import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { AdminGuard } from '@app/common/guards/admin.guard';
import { UserId } from '@app/shared/types/ids';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentSchema,
  type CreateAssignmentInput,
  ListAssignmentsQuerySchema,
  type ListAssignmentsQuery,
} from './assignment.schema';
import { type AssignmentDomain, type AssignmentHistoryDomain } from './assignment.types';

@Controller('admin/assignments')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListAssignmentsQuerySchema)) query: ListAssignmentsQuery,
  ): Promise<{ assignments: AssignmentDomain[] }> {
    return { assignments: await this.service.list(query) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateAssignmentSchema)) body: CreateAssignmentInput,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ assignment: AssignmentDomain }> {
    return { assignment: await this.service.create(body, UserId(actor.id)) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ assignment: AssignmentDomain }> {
    return { assignment: await this.service.remove(id, UserId(actor.id)) };
  }

  @Get(':id/history')
  async history(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ history: AssignmentHistoryDomain[] }> {
    return { history: await this.service.listHistory(id) };
  }
}
