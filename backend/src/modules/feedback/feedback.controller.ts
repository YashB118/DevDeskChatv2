import {
  Body,
  Controller,
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
import { UserId } from '@app/shared/types/ids';
import { NotFoundError } from '@app/shared/errors';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { UserRepository } from '@app/modules/users/user.repository';
import { type UserDomain } from '@app/modules/users/user.types';
import { FeedbackService } from './feedback.service';
import {
  ListFeedbackQuerySchema,
  type ListFeedbackQuery,
  MarkFeedbackSchema,
  type MarkFeedbackInput,
  SubmitFeedbackSchema,
  type SubmitFeedbackInput,
} from './feedback.schema';
import { type FeedbackDomain } from './feedback.types';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(
    private readonly service: FeedbackService,
    private readonly users: UserRepository,
  ) {}

  @Post()
  async submit(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Body(new ZodValidationPipe(SubmitFeedbackSchema)) body: SubmitFeedbackInput,
  ): Promise<{ feedback: FeedbackDomain }> {
    const user = await this.resolve(current);
    return { feedback: await this.service.submit(user, body) };
  }

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Query(new ZodValidationPipe(ListFeedbackQuerySchema)) query: ListFeedbackQuery,
  ): Promise<{ feedback: FeedbackDomain[] }> {
    const user = await this.resolve(current);
    return { feedback: await this.service.list(user, query) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(MarkFeedbackSchema)) body: MarkFeedbackInput,
  ): Promise<{ feedback: FeedbackDomain }> {
    const user = await this.resolve(current);
    return { feedback: await this.service.setRead(user, id, body.read) };
  }

  /**
   * @deprecated kept for one release while the frontend cuts over to PATCH /api/feedback/:id.
   * Remove in a follow-up cleanup phase.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ feedback: FeedbackDomain }> {
    const user = await this.resolve(current);
    return { feedback: await this.service.setRead(user, id, true) };
  }

  private async resolve(current: AuthenticatedRequestUser): Promise<UserDomain> {
    const user = await this.users.findById(UserId(current.id));
    if (user === null) throw new NotFoundError('user');
    return user;
  }
}
