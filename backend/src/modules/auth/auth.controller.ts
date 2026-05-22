import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type CookieOptions, type Request, type Response } from 'express';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { Public } from '@app/common/decorators/public.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RateLimit } from '@app/common/rate-limit';
import { UserId } from '@app/shared/types/ids';
import { AuthService, type RefreshContext } from './auth.service';

function extractLoginEmail(req: Request): string | null {
  const body = (req.body ?? {}) as { email?: unknown };
  if (typeof body.email !== 'string') return null;
  const trimmed = body.email.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

function buildContext(req: Request): RefreshContext {
  const ctx: RefreshContext = {};
  if (req.ip !== undefined) ctx.ip = req.ip;
  const ua = req.header('user-agent');
  if (ua !== undefined) ctx.userAgent = ua;
  return ctx;
}

// `cookie-parser` middleware populates `req.cookies`. The type augmentation it
// ships sometimes drops out of resolution, so we re-read it through an unknown
// hop instead of leaning on the implicit any.
function readCookies(req: Request): Record<string, string> {
  const raw = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return raw ?? {};
}
import { InvalidRefreshTokenError } from './auth.errors';
import {
  type LoginInput,
  LoginSchema,
  type PasswordChangeInput,
  PasswordChangeSchema,
} from './auth.schema';
import { type AuthenticatedRequestUser } from './auth.types';

interface LoginResponseBody {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    role: string;
    displayName: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ preset: 'auth', mode: 'hard', identify: extractLoginEmail })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.login(body.email, body.password, buildContext(req));
    this.setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
    return {
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const cookies = readCookies(req);
    const presented = cookies[this.config.REFRESH_COOKIE_NAME];
    if (!presented) {
      this.clearRefreshCookie(res);
      throw new InvalidRefreshTokenError();
    }
    try {
      const result = await this.authService.refresh(presented, buildContext(req));
      this.setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
      return {
        accessToken: result.accessToken,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
        user: result.user,
      };
    } catch (err) {
      this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = readCookies(req);
    const presented = cookies[this.config.REFRESH_COOKIE_NAME];
    await this.authService.logout(presented, UserId(user.id));
    this.clearRefreshCookie(res);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body(new ZodValidationPipe(PasswordChangeSchema)) body: PasswordChangeInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.changePassword(UserId(user.id), body.currentPassword, body.newPassword);
    this.clearRefreshCookie(res);
  }

  private cookieOptions(expires: Date): CookieOptions {
    const opts: CookieOptions = {
      httpOnly: true,
      secure: this.config.REFRESH_COOKIE_SECURE,
      sameSite: 'strict',
      path: this.config.REFRESH_COOKIE_PATH,
      expires,
    };
    if (this.config.REFRESH_COOKIE_DOMAIN !== undefined) {
      opts.domain = this.config.REFRESH_COOKIE_DOMAIN;
    }
    return opts;
  }

  private setRefreshCookie(res: Response, token: string, expires: Date): void {
    res.cookie(this.config.REFRESH_COOKIE_NAME, token, this.cookieOptions(expires));
  }

  private clearRefreshCookie(res: Response): void {
    // clearCookie must mirror the attributes used to set the cookie or the
    // browser refuses to remove it. Reuse the same options minus `expires`.
    const opts: CookieOptions = {
      httpOnly: true,
      secure: this.config.REFRESH_COOKIE_SECURE,
      sameSite: 'strict',
      path: this.config.REFRESH_COOKIE_PATH,
    };
    if (this.config.REFRESH_COOKIE_DOMAIN !== undefined) {
      opts.domain = this.config.REFRESH_COOKIE_DOMAIN;
    }
    res.clearCookie(this.config.REFRESH_COOKIE_NAME, opts);
  }
}
