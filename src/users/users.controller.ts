import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { SkipThrottle } from '@nestjs/throttler';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { updateProfileSchema, type UpdateProfileBody } from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
@SkipThrottle({
  register: true,
  login: true,
  refresh: true,
  'refresh-token': true,
  logout: true,
})
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthPrincipal | null) {
    return this.users.getProfile(this.userId(user));
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthPrincipal | null,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileBody,
  ) {
    return this.users.updateDisplayName(this.userId(user), body.displayName);
  }

  private userId(user: AuthPrincipal | null): string {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return user.id;
  }
}
