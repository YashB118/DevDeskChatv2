import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { type UserDomain } from './user.types';
import { UsersService } from './users.service';
import {
  AdminPasswordResetSchema,
  type AdminPasswordResetInput,
  CreateUserSchema,
  type CreateUserInput,
  ListUsersQuerySchema,
  type ListUsersQuery,
  UpdateUserSchema,
  type UpdateUserInput,
} from './users.schema';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersAdminController {
  constructor(private readonly service: UsersService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<{ users: UserDomain[] }> {
    const opts: { includeDisabled?: boolean; limit?: number; offset?: number } = {};
    if (query.includeDisabled !== undefined) opts.includeDisabled = query.includeDisabled;
    if (query.limit !== undefined) opts.limit = query.limit;
    if (query.offset !== undefined) opts.offset = query.offset;
    return { users: await this.service.list(opts) };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ user: UserDomain }> {
    return { user: await this.service.get(UserId(id)) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ user: UserDomain }> {
    return { user: await this.service.create(body, UserId(actor.id)) };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ user: UserDomain }> {
    return { user: await this.service.update(UserId(id), body, UserId(actor.id)) };
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ user: UserDomain }> {
    return { user: await this.service.setDisabled(UserId(id), true, UserId(actor.id)) };
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ user: UserDomain }> {
    return { user: await this.service.setDisabled(UserId(id), false, UserId(actor.id)) };
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AdminPasswordResetSchema)) body: AdminPasswordResetInput,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<void> {
    await this.service.resetPassword(UserId(id), body, UserId(actor.id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ): Promise<{ user: UserDomain }> {
    // Soft delete via disable; hard delete cascades destroy audit history.
    return { user: await this.service.setDisabled(UserId(id), true, UserId(actor.id)) };
  }
}
