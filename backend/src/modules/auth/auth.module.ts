import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { UsersModule } from '@app/modules/users/users.module';
import { RefreshTokenEntity } from './refresh-token.entity';
import { AuditLogEntity } from './audit-log.entity';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Global()
@Module({
  imports: [
    forwardRef(() => UsersModule),
    TypeOrmModule.forFeature([RefreshTokenEntity, AuditLogEntity]),
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        privateKey: config.JWT_PRIVATE_KEY,
        publicKey: config.JWT_PUBLIC_KEY,
        signOptions: {
          algorithm: 'RS256',
          issuer: config.JWT_ISSUER,
          audience: config.JWT_AUDIENCE,
          expiresIn: config.JWT_ACCESS_TTL_SECONDS,
        },
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: config.JWT_ISSUER,
          audience: config.JWT_AUDIENCE,
        },
      }),
    }),
  ],
  providers: [AuthRepository, AuthService],
  controllers: [AuthController],
  exports: [AuthService, AuthRepository, JwtModule],
})
export class AuthModule {}
