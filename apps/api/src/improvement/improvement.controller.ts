import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ImprovementProposal, ImprovementProposalSummary } from '@app/shared';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { logUserOf } from '../chat-log/chat-log.service';
import { CreateImprovementDto } from './improvement.dto';
import { ImprovementService } from './improvement.service';

type AuthedRequest = Request & { user?: Record<string, unknown> };

const bearerOf = (req: Request) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/improvements')
export class ImprovementController {
  constructor(private readonly improvements: ImprovementService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Start generating improvement proposals from Bad message reviews' })
  async create(
    @Body() dto: CreateImprovementDto,
    @Req() req: AuthedRequest,
  ): Promise<{ ids: string[] }> {
    const user = logUserOf(req.user);
    const ids = await this.improvements.create(dto.reviewIds, {
      sub: user.sub ?? null,
      name: user.name,
      idToken: bearerOf(req),
    });
    return { ids };
  }

  @Get()
  @ApiOperation({ summary: 'Improvement proposals, newest first' })
  list(): Promise<ImprovementProposalSummary[]> {
    return this.improvements.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'A proposal with its cases, diagnoses and file changes' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ImprovementProposal> {
    return this.improvements.get(id);
  }

  @Post(':id/discard')
  @HttpCode(204)
  @ApiOperation({ summary: 'Discard a ready or failed proposal' })
  discard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.improvements.discard(id);
  }
}
