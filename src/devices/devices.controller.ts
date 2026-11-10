import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { SkipThrottle } from '@nestjs/throttler';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { deviceIdSchema, registerDeviceSchema, type RegisterDeviceBody } from './devices.schemas.js';
import { DevicesService } from './devices.service.js';

@Controller('devices')
@SkipThrottle({
  register: true,
  login: true,
  refresh: true,
  'refresh-token': true,
  logout: true,
})
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal | null) {
    return this.devices.list(this.userId(user));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUser() user: AuthPrincipal | null,
    @Body({ schema: registerDeviceSchema }) body: RegisterDeviceBody,
  ) {
    const result = await this.devices.register(this.userId(user), body);
    return result.device;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: AuthPrincipal | null,
    @Param('id', { schema: deviceIdSchema }) deviceId: string,
  ): Promise<void> {
    await this.devices.revoke(this.userId(user), deviceId);
  }

  private userId(user: AuthPrincipal | null): string {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return user.id;
  }
}
