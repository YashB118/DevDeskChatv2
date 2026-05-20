import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionRunner } from '@app/infra/db/transactions';
import { AuthModule } from '@app/modules/auth/auth.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { UserEntity } from './user.entity';
import { UserRepository } from './user.repository';
import { UsersService } from './users.service';
import { UsersAdminController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), forwardRef(() => AuthModule), RealtimeModule],
  controllers: [UsersAdminController],
  providers: [UserRepository, UsersService, TransactionRunner],
  exports: [UserRepository, UsersService],
})
export class UsersModule {}
