import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionRunner } from '@app/infra/db/transactions';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { UsersModule } from '@app/modules/users/users.module';
import { DeveloperAssignmentEntity } from './developer-assignment.entity';
import { AssignmentHistoryEntity } from './assignment-history.entity';
import { AssignmentRepository } from './assignment.repository';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeveloperAssignmentEntity, AssignmentHistoryEntity]),
    UsersModule,
    RealtimeModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentRepository, AssignmentsService, TransactionRunner],
  exports: [AssignmentsService, AssignmentRepository],
})
export class AssignmentsModule {}
