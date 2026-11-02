import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SettingsRefs, SettingsView } from '@app/shared';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { logUserOf } from '../chat-log/chat-log.service';
import { SettingsRefsDto, UpdateSettingsDto } from './settings.dto';
import { SettingsAdminService } from './settings.admin.service';

type AuthedRequest = Request & { user?: Record<string, unknown> };

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly admin: SettingsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Runtime settings in effect (the token only as set / not set)' })
  get(): SettingsView {
    return this.admin.view();
  }

  @Put()
  @ApiOperation({ summary: 'Change settings and apply them without a restart' })
  update(@Body() dto: UpdateSettingsDto, @Req() req: AuthedRequest): Promise<SettingsView> {
    const user = logUserOf(req.user);
    return this.admin.save(dto, user.name ?? user.sub);
  }

  @Post('refs')
  @ApiOperation({ summary: 'Branches and tags of a config repository (token in the body)' })
  refs(@Body() dto: SettingsRefsDto): Promise<SettingsRefs> {
    return this.admin.refs(dto);
  }
}
